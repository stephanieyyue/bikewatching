// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoic3l5dWUiLCJhIjoiY203Y2V1bWJ4MGd5cDJrb2RudjR0b2g0NSJ9.kc7-rTzyNj7BYvqYokvKeg';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-70.97896581727987, 42.339629853296735], 
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

let stations = [];
let trips = [];
let filteredTrips = [];
let timeFilter = -1;

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

map.on('style.load', () => {
    console.log("Map style loaded!");
    function minutesSinceMidnight(dateString) {
        const date = new Date(dateString);
        return date.getUTCHours() * 60 + date.getUTCMinutes(); // Force UTC calculation
    }
    
    // Attach to `window` for debugging in console
    window.minutesSinceMidnight = minutesSinceMidnight;
    
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
        console.log("Filtering trips at:", timeFilter);
        
        if (timeFilter === -1) {
            filteredTrips = trips; // Skip filtering if time is "Any time"
        } else {
            let lowerBound = timeFilter - 30;
            let upperBound = timeFilter + 30;
    
            filteredTrips = trips.filter(trip => {
                const startMin = minutesSinceMidnight(trip.started_at);
                const endMin = minutesSinceMidnight(trip.ended_at);
    
                return (startMin >= lowerBound && startMin <= upperBound) ||
                       (endMin >= lowerBound && endMin <= upperBound);
            });
        }
    
        console.log("Filtered Trips Count:", filteredTrips.length);
        
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
            .attr("fill", "steelblue")
            .attr("fill-opacity", 0.6)
            .attr("stroke", "white")
            .attr("stroke-width", 1);
    
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
                .attr("opacity", 0.8);

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
            updateStationTraffic();
        })
        .catch(error => console.error("Error loading traffic data:", error));

    // ✅ Attach Map Event Listeners
    map.on("move", updatePositions);
    map.on("zoom", updatePositions);
    map.on("resize", updatePositions);
    map.on("moveend", updatePositions);
});
