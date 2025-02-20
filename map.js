function addTrafficFlowLegend() {
    // Create legend container
    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.style.position = 'absolute';
    legend.style.top = '70px';
    legend.style.right = '10px';
    legend.style.background = 'white';
    legend.style.padding = '10px';
    legend.style.borderRadius = '4px';
    legend.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    legend.style.zIndex = '10';
    legend.style.display = 'flex';
    legend.style.flexDirection = 'column';
    legend.style.gap = '8px';
    legend.style.fontSize = '12px';
    
    legend.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">Traffic Flow</div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 15px; height: 15px; background-color: steelblue; border-radius: 50%;"></span>
            <span>More departures</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 15px; height: 15px; background-color: purple; border-radius: 50%;"></span>
            <span>Balanced</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 15px; height: 15px; background-color: darkorange; border-radius: 50%;"></span>
            <span>More arrivals</span>
        </div>
    `;
    
    document.body.appendChild(legend);
}

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoic3l5dWUiLCJhIjoiY203Y2V1bWJ4MGd5cDJrb2RudjR0b2g0NSJ9.kc7-rTzyNj7BYvqYokvKeg';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027], 
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

let stations = [];
let trips = [];
let filteredTrips = [];
let timeFilter = -1;
const stationFlow = d3.scaleQuantize()
    .domain([0, 1])
    .range([0, 0.5, 1]);

// ✅ Select the slider and time display elements
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');



// ✅ Ensure Tooltip is Created Only Once
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background-color", "white")
    .style("border", "1px solid black")
    .style("padding", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("display", "none");

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
    

map.on('style.load', () => {
    console.log("Map style loaded!");
    // Define a common style for bike lanes
    const bikeLineStyle = {
        'line-color': '#32D400',  // Bright green
        'line-width': 3,
        'line-opacity': 0.6
    };
    
    // Add Boston bike lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });
    
    map.addLayer({
        id: 'bike-lanes-boston',
        type: 'line',
        source: 'boston_route',
        paint: bikeLineStyle
    });
    
    // Add Cambridge bike lanes
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });
    
    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: bikeLineStyle
    });

    function minutesSinceMidnight(dateString) {
        const date = new Date(dateString);
        return date.getUTCHours() * 60 + date.getUTCMinutes(); // Force UTC calculation
    }
    
    // Attach to `window` for debugging in console
    window.minutesSinceMidnight = minutesSinceMidnight;

    function filterByMinute(tripsByMinute, minute) {
        // Normalize both to the [0, 1439] range
        let minMinute = (minute - 60 + 1440) % 1440;
        let maxMinute = (minute + 60) % 1440;
        
        if (minMinute > maxMinute) {
            // Time range spans midnight
            let beforeMidnight = tripsByMinute.slice(minMinute);
            let afterMidnight = tripsByMinute.slice(0, maxMinute + 1);
            return beforeMidnight.concat(afterMidnight).flat();
        } else {
            // Time range doesn't span midnight
            return tripsByMinute.slice(minMinute, maxMinute + 1).flat();
        }
    }
    
    if (d3.select("#map svg").empty()) {
        d3.select("#map").append("svg");
    }

    const svg = d3.select("#map").select("svg");

    function getCoords(station) {
        const point = new mapboxgl.LngLat(station.lon, station.lat);
        const { x, y } = map.project(point);
        return { cx: x, cy: y };
    }

    function updatePositions() {
        svg.selectAll("circle")
            .attr("cx", d => getCoords(d).cx)
            .attr("cy", d => getCoords(d).cy);
    }

    function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value);

        if (timeFilter === -1) {
            selectedTime.textContent = ""; 
            anyTimeLabel.style.display = "block";
        } else {
            selectedTime.textContent = formatTime(timeFilter); 
            anyTimeLabel.style.display = "none";
        }

        filterTripsByTime();
    }

    function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes);
        return date.toLocaleTimeString('en-US', { timeStyle: 'short' });
    }

    function filterTripsByTime() {
        if (timeFilter === -1) {
            // Use all trips when no filter is applied
            filteredTrips = trips;
        } else {
            // Use our optimized bucketing system for better performance
            const departingTrips = filterByMinute(departuresByMinute, timeFilter);
            const arrivingTrips = filterByMinute(arrivalsByMinute, timeFilter);
            
            // Combine departing and arriving trips (removing duplicates)
            const allTrips = [...departingTrips, ...arrivingTrips];
            const tripIds = new Set();
            filteredTrips = allTrips.filter(trip => {
                if (tripIds.has(trip.ride_id)) {
                    return false;
                }
                tripIds.add(trip.ride_id);
                return true;
            });
        }
        
        // Update UI efficiently
        requestAnimationFrame(updateStationTraffic);
    }
    

    

    function updateStationTraffic() {
        console.log("Updating station traffic with", filteredTrips.length, "filtered trips");
    
        let departures = d3.rollup(filteredTrips, v => v.length, d => d.start_station_id);
        let arrivals = d3.rollup(filteredTrips, v => v.length, d => d.end_station_id);
    
        stations.forEach(station => {
            let id = station.short_name;
            station.departures = departures.get(id) ?? 0;
            station.arrivals = arrivals.get(id) ?? 0;
            station.totalTraffic = station.departures + station.arrivals;
        });
    
        updateStationSizes();
    }
    
    

    function updateStationSizes() {
        console.log("Updating station sizes...");
        
        let maxTraffic = d3.max(stations, d => d.totalTraffic || 0);
    
        let radiusScale = d3.scaleSqrt()
            .domain([0, maxTraffic])
            .range(timeFilter === -1 ? [1.5, 12] : [2, 20]); 
    
        let circles = d3.select("#map svg").selectAll("circle")
            .data(stations, d => d.short_name);
    
        circles.transition().duration(300) // 🔄 Smooth transition
            .attr("r", d => radiusScale(d.totalTraffic || 0))
            .attr("fill-opacity", 0.6)
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .style("--departure-ratio", d => {
                // Calculate ratio of departures to total traffic
                if (!d.totalTraffic || d.totalTraffic === 0) return 0.5; // Default to balanced
                return stationFlow(d.departures / d.totalTraffic);
            });
            
        // Update the tooltip text to reflect current traffic values
        circles.select("title")
            .text(d => `${d.name || d.short_name || "Station"}: ${d.totalTraffic || 0} trips (${d.departures || 0} departures, ${d.arrivals || 0} arrivals)`);
    
        console.log("✅ Map should now be updating!");
    }
    

    // ✅ Attach Slider Event
    let debounceTimer;

    timeSlider.addEventListener('input', () => {
        console.log("Time slider moved:", timeSlider.value);
        updateTimeDisplay();

        clearTimeout(debounceTimer); // Clear any previous calls
        debounceTimer = setTimeout(() => {
        timeFilter = parseInt(timeSlider.value);
        filterTripsByTime(); // Run filtering after a small delay
    }, 100); // Adjust delay as needed (100ms for smooth experience)
});


    // ✅ Load Bike Stations
    d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')
        .then(jsonData => {
            console.log('Loaded JSON Data:', jsonData);

            if (!jsonData.data || !jsonData.data.stations) {
                console.error("Error: 'stations' property is missing in the JSON response");
                return;
            }

            stations = jsonData.data.stations;

            svg.selectAll("circle")
                .data(stations)
                .enter()
                .append("circle")
                .attr("r", 2) // ⬅ Default small size
                .attr("fill", "steelblue")
                .attr("stroke", "white")
                .attr("stroke-width", 1)
                .attr("opacity", 0.8)
                .attr("pointer-events", "auto") // Enable pointer events on circles
                .each(function(d) {
                    // Add <title> element inside each circle for browser tooltips
                    d3.select(this)
                        .append("title")
                        .text(`${d.name || d.short_name || "Station"}: 0 trips (0 departures, 0 arrivals)`);
                });

            updatePositions();
        })
        .catch(error => console.error('Error loading JSON:', error));

    // ✅ Load Bike Traffic Data
    d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv")
        .then(data => {
            trips = data.map(trip => ({
                ...trip,
                started_at: new Date(trip.started_at),
                ended_at: new Date(trip.ended_at)
            }));

            console.log("Loaded Bike Traffic Data:", trips.length);
            trips.forEach(trip => {
                const startedMinutes = minutesSinceMidnight(trip.started_at);
                const endedMinutes = minutesSinceMidnight(trip.ended_at);
                
                // Add trip to departure bucket
                departuresByMinute[startedMinutes].push(trip);
                
                // Add trip to arrival bucket
                arrivalsByMinute[endedMinutes].push(trip);
            });
            updateStationTraffic();
        })
        .catch(error => console.error("Error loading traffic data:", error));

    // ✅ Attach Map Event Listeners
    map.on("move", updatePositions);
    map.on("zoom", updatePositions);
    map.on("resize", updatePositions);
    map.on("moveend", updatePositions);
});
