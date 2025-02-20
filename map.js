// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoic3l5dWUiLCJhIjoiY203Y2V1bWJ4MGd5cDJrb2RudjR0b2g0NSJ9.kc7-rTzyNj7BYvqYokvKeg';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-70.97896581727987, 42.339629853296735], // [longitude, latitude] for Boston
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});
map.on('style.load', () => {
    console.log("Map style loaded!");
    if (d3.select("#map svg").empty()) {
        d3.select("#map").append("svg");
    }
    const svg = d3.select("#map").select("svg");
    let stations = [];

    function getCoords(station) {
        const point = new mapboxgl.LngLat(station.lon, station.lat); // Convert Lon/Lat to Mapbox LngLat
        const { x, y } = map.project(point); // Project to pixel coordinates
        return { cx: x, cy: y }; // Return as object for SVG attributes
    }

    // Add the Boston bike lanes
    map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });
  
    map.addLayer({
      id: 'bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: {
        'line-color': 'green',
        'line-width': 3,
        'line-opacity': 0.4
      }
    });
  
    // Add Cambridge bike lanes
    map.addSource('cambridge_route', {
      type: 'geojson',
      data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });
  
    map.addLayer({
      id: 'cambridge-bike-lanes',
      type: 'line',
      source: 'cambridge_route',
      paint: {
        'line-color': 'blue',
        'line-width': 3,
        'line-opacity': 0.4
      }
    });
  
    d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')
        .then(jsonData => {
            console.log('Loaded JSON Data:', jsonData);

            if (!jsonData.data || !jsonData.data.stations) {
                console.error("Error: 'stations' property is missing in the JSON response");
                return;
            }

            stations = jsonData.data.stations; // Store station data globally

            // Append circles to the SVG for each station
            const circles = svg.selectAll("circle")
                .data(stations)
                .enter()
                .append("circle")
                .attr("r", 5) // Radius of the circle
                .attr("fill", "steelblue") // Circle color
                .attr("stroke", "white") // Border color
                .attr("stroke-width", 1) // Border thickness
                .attr("opacity", 0.8);

            updatePositions(); // Initial positioning
        })
        .catch(error => {
            console.error('Error loading JSON:', error);
        });

    // Function to update marker positions dynamically
    function updatePositions() {
        svg.selectAll("circle")
            .attr("cx", d => getCoords(d).cx) // Update x-position
            .attr("cy", d => getCoords(d).cy); // Update y-position
    }

    // ✅ Attach map event listeners here (AFTER loading the data)
    map.on("move", updatePositions);   // Update when panning
    map.on("zoom", updatePositions);   // Update when zooming
    map.on("resize", updatePositions); // Update when window resizes
    map.on("moveend", updatePositions); // Final adjustment after movement
  });
  