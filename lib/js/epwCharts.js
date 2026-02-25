/*-------------------------------------------------------------------------
 * epwCharts.js
 * Chart library for epwvis
 *
 * DEPENDENCIES
 *  - d3.js
 *-------------------------------------------------------------------------*/

function clearEPWCharts() {
    d3.selectAll("svg").remove();
    window.updatePsychroPoints = null;
};

function epwData(epw,value){
	// for constructing a data object with just one value
	var month = epw.month();
	var day = epw.day();
	var hour = epw.hour();
	var dayOfYear = [];
	var data = [];

	for (var i=0; i < value.length; i++){
	  dayOfYear[i] = Math.floor(i/24)+1;
	  datum = {"index":i,"month":month[i],"day":day[i],"hour":hour[i],"dayOfYear":dayOfYear[i],"value":value[i]};
	  data.push(datum);
	};

    //console.log(data);
    return data;
};

function epwDataDefault(epw,unitSystem){
	var month = epw.month(),
		day = epw.day(),
		hour = epw.hour(),
		dryBulbTemperature = epw.dryBulbTemperature(),
		relativeHumidity = epw.relativeHumidity(),
		dewPointTemperature = epw.dewPointTemperature(),
		wetBulbTemperature = epw.wetBulbTemperature(),
		humidityRatio = epw.humidityRatio(),
		specificHumidity = epw.specificHumidity(),
		vaporPressure = epw.vaporPressure(),
		moistAirEnthalpy = epw.moistAirEnthalpy(),
		moistAirVolume = epw.moistAirVolume(),
		degreeOfSaturation = epw.degreeOfSaturation(),
		moistAirDensity = epw.moistAirDensity(),
		windSpeed = epw.windSpeed(),
		windDirection = epw.windDirection(),
		totalSkyCover = epw.totalSkyCover(),
		dayOfYear = [],
		data = [];

		if (unitSystem == "IP") {
		  dryBulbTemperature = convertCtoF(dryBulbTemperature);
		  dewPointTemperature = convertCtoF(dewPointTemperature);
		  windSpeed = convertKnots(windSpeed);
		};

	for (var i=0; i < month.length; i++){
	  dayOfYear[i] = Math.floor(i/24)+1;
	  datum = {"index":i,"month":month[i],"day":day[i],
			   "hour":hour[i],"dayOfYear":dayOfYear[i],
			   "dryBulbTemperature":dryBulbTemperature[i],
			   "relativeHumidity":relativeHumidity[i],
			   "dewPointTemperature":dewPointTemperature[i],
			   "wetBulbTemperature":wetBulbTemperature[i],
			   "humidityRatio":humidityRatio[i],
			   "specificHumidity":specificHumidity[i],
			   "vaporPressure":vaporPressure[i],
			   "moistAirEnthalpy":moistAirEnthalpy[i],
			   "moistAirVolume":moistAirVolume[i],
			   "degreeOfSaturation":degreeOfSaturation[i],
			   "moistAirDensity":moistAirDensity[i],
			   "windSpeed":windSpeed[i],
			   "windDirection":windDirection[i],
			   "totalSkyCover":totalSkyCover[i]};
	  data.push(datum);
	};

    //console.log(data);
    return data;
};

//unit coversion functions, could be done more cleanly
function valCtoF(value,index,arr) {
    arr[index] = 32 + value*1.8;
};
function convertCtoF(array) {
    array.forEach(valCtoF);
    return array;
};
function valKnots(value,index,arr) {
    arr[index] = value*1.94384;
};
function convertKnots(array) {
    array.forEach(valKnots);
    return array;
};

//initialization code for the drybulb temperature floodplot
function epwTempFloodPlot(epw) {
    params = {};
    var value = [];
    if (unitSystem == "IP") {
        value = convertCtoF(epw.dryBulbTemperature());
        params.unit = "\xB0F";
    } else {
        value = epw.dryBulbTemperature();
        params.unit = "\xB0C";
    };
    var data = epwData(epw,value); //encoding most of the object construction here
    params.id = "#epwTempFloodPlot";
    params.min_value = Math.min.apply(Math,value);
    params.max_value = Math.max.apply(Math,value);
    params.steps = 7;
    params.step_colors = ['darkblue','blue', 'cyan', 'greenyellow', 'yellow', 'orange', 'red','darkred'];
    epwFloodPlot(data,params);
};

//initialization code for the cloud cover floodplot
function epwCloudFloodPlot(epw) {
    var value = epw.totalSkyCover();
    var data = epwData(epw,value); //encoding most of the object construction here
    params = {};
    params.id = "#epwCloudFloodPlot";
    params.min_value = 0;
    params.max_value = 10;
    params.unit = "";
    params.steps = 10;
    params.step_colors = ['#6fdcfb','#6bcde9', '#68bfd8', '#65b1c7', '#62a3b6', '#5f95a5', '#5b8793','#587982','#556b71','#525d60','#4f4f4f'];
    epwFloodPlot(data,params);
};

//initialization code for the windrose
function epwWindRose(epw) {
    params = {};
    var value = [];
    if (unitSystem == "IP") {
        value = convertKnots(epw.windSpeed());
        params.unit = "knots";
        params.scale_steps = [3.5,6.5,10.5,16.5,21.5,27]; //Beaufort scale in knots
        params.steps = 6;
    } else {
        value = epw.windSpeed();
        params.unit = "m/s";
        params.scale_steps = [1.8,3.3,5.4,8.5,11.1,13.9]; //Beaufort scale in m/s
        params.steps = 6;
    };

    var data = epwData(epw,value); //encoding most of the object construction here
    var direction = epw.windDirection();

    for (var i=0; i < value.length; i++){
        data[i].direction = direction[i];
        data[i].directionGroup = Math.round(direction[i] / 22.5);
        if (data[i].directionGroup == 0) { //0 and 360 are the same
            data[i].directionGroup = 16;
        };
        if (data[i].value == 0) { //0 wind speed is 0 group
            data[i].directionGroup = 0;
        };
    };

    params.id = "#epwWindRose";
    params.min_value = 0;
    params.max_value = Math.max.apply(Math,value);
    params.length = value.length;
    params.directions = 16;
    params.labels = ['NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW','N'];
    params.step_colors = ['#d73027','#fc8d59','#fee090','#e0f3f8','#91bfdb','#4575b4'];
    params.legend_text = ['Light Air','Light Breeze','Gentle Breeze','Moderate Breeze','Fresh Breeze','Strong Breeze'];

    epwRadialChart(data,params)
};

//general code for making a radial chart
function epwRadialChart(data,params) {
	//references
    //http://sustainabilityworkshop.autodesk.com/buildings/wind-rose-diagrams
    //http://bl.ocks.org/nbremer/6506614
	//http://bl.ocks.org/chrisrzhou/2421ac6541b68c1680f8
    //add Beaufort scale

    var min_value = params.min_value,
    max_value = params.max_value,
    steps = params.steps,	//number of steps in color scale
    scale_steps = params.scale_steps,
    legend_scale = [],
    color_values = [];

	var colorScale = d3.scale.ordinal()
		.domain(scale_steps)
		.range(params.step_colors)

	//make a new data group based on the scale_steps
	for (var i=0; i < params.length; i++){
		for (var j=0; j < steps; j++) {
			data[i].scaleStep = j;
			if (data[i].value < scale_steps[j]) { break; }
		};
	};

	//bin the data by direction and scale_step
	var mapped_data = d3.nest()
	  .key(function(d) { return d.directionGroup; })
	  .key(function(d) { return d.scaleStep; })
      .rollup(function(v) { return v.length; })
	  .map(data);
	//console.log(JSON.stringify(mapped_data));
	//console.log(mapped_data[1])

	// Count calm hours directly (directionGroup === 0 means windSpeed === 0)
	var zero_num = 0;
	for (var i = 0; i < data.length; i++) {
		if (data[i].directionGroup === 0) { zero_num++; }
	}
	var zero_frac = params.length > 0 ? zero_num / params.length : 0;

	//take nested data and transform into arc_data, and get max radius for scaling
	var arc_data = [],
        max_radius = 0;
	for (var i=1; i <= params.directions; i++) {
		var c = mapped_data[i];
		if (!c) { continue; } // no records in this direction
		var prior_radius = 0;
		for (var j=0; j < steps; j++) {
			//skip making arc if no data in that step
			if (c[j] == null) { continue; }
			//do something here to build the arc data object
			var arc = [];
			arc.directionGroup = i;
			arc.scaleStep = j;
			arc.innerRadius = prior_radius;
			arc.outerRadius = prior_radius + c[j];
            if (arc.outerRadius > max_radius) { max_radius = arc.outerRadius};
			arc_data.push(arc);
			prior_radius = arc.outerRadius;
		};
	};
   //console.log(arc_data);

    // define svg size
    var margin = {top: 20, right: 220, bottom: 20, left: 20},
    width = 700 - margin.left - margin.right,
	height = 540 - margin.top - margin.bottom,
    cx = width/2,
    cy = height/2,
    radius = Math.min(cx,cy);

	var svg = d3.select(params.id).append("svg")
		.attr("width", width + margin.left + margin.right)
		.attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + (cx + margin.left) + "," + (cy + margin.top) +")");

	//still need to add frequency axis, lines for now
	var lines = svg.append("g").selectAll("line")
        .data(params.labels)
	  .enter().append("line")
	    .attr("class","label-line")
		.attr("y2", -0.85*radius)
		.style("stroke", "black") //include in css file
        .style("stroke-width",".5px") //include in css file
		.attr("transform", function(d, i) { return "rotate(" + (i * 360 / params.directions) + ")"; });

	var labels = svg.append("g").selectAll("text")
        .data(params.labels)
	  .enter().append("text")
	    .attr("class","label")
		.attr("text-anchor", "middle")
		.attr("x", function(d, i) { return 0.9*radius * Math.sin((i+1)*2*Math.PI/params.directions); })
		.attr("y", function(d, i) { return 0.9*radius * -Math.cos((i+1)*2*Math.PI/params.directions); })
		.text( function(d, i) { return d; });

	var scaling_factor = max_radius > 0 ? (0.8*radius)/max_radius : 0; //set max_radius to 1
    var arc = d3.svg.arc()
        .outerRadius(function(d) { return (d.outerRadius*scaling_factor);})
        .innerRadius(function(d) { return (d.innerRadius*scaling_factor);})
        .startAngle(function(d) { return (d.directionGroup * (2*Math.PI/params.directions)) - (Math.PI/params.directions);})
        .endAngle(function(d) { return (d.directionGroup * (2*Math.PI/params.directions)) + (Math.PI/params.directions);});

	var arcs = svg.selectAll('path')
		.data(arc_data)
	  .enter().append("path")
		.attr("d", arc)
		.style("fill", function(d) { return colorScale(d.scaleStep); })
		.style("stroke","white")
	    //.on('mouseover', function(d) {return console.log("directionGroup:" + d.directionGroup + ",scaleStep:" + d.scaleStep);}); //tooltip here

		//legend element
	var legend = svg.append("g")
		.attr("class","legend")
		.attr("transform", "translate(" + cx + "," + (-cy) + ")")

	//color legend for color scale
	legend.selectAll("rect")
		.data(params.step_colors)
	  .enter().append("rect")
		.attr("x", 0)
		.attr("y", function(d,i) { return cy - 40 - i*20; })
		.attr("width", 15)
		.attr("height", 15)
		.style("fill", function(d) { return d; })

	//text label for the color scale
	legend.selectAll("text")
		.data(params.scale_steps)
	 .enter().append("text")
		.style("text-anchor", "left")
		.attr("x", 20)
		.attr("y", function(d,i) {return cy - 40 - i*20; } )
		.attr("dy", "1em")
		.text(function(d,i) {
			var label = "";
			if (i == 0) { label = "0 - " + d + " " + params.unit + ", " + params.legend_text[i]; }
			else { label = params.scale_steps[i-1] + " - " + d + " " + params.unit + ", " + params.legend_text[i]; }
			return label;
		});

    //Beaufort Scale
	svg.append("g")
      .attr("class","legend-header")
	  .attr("transform", "translate(" + (cx) + "," + 0 + ")")
	  .append("text")
	  .style("text-anchor", "left")
	  .text("Beaufort Scale")

	//number of selected and calm hours
	var formatPct = d3.format(".1%");
	var totalLength = params.totalLength || params.length;
	var selected_frac = totalLength > 0 ? params.length / totalLength : 0;

	var infoGroup = svg.append("g")
	  .attr("class","legend-header")
	  .attr("transform", "translate(" + (-cx) + "," + (-(cy - 15)) + ")");

	infoGroup.append("text")
	  .attr("y", 0)
	  .style("text-anchor", "start")
	  .text(params.length + " of " + totalLength + " hours (" + formatPct(selected_frac) + ") selected");

	infoGroup.append("text")
	  .attr("y", 16)
	  .style("text-anchor", "start")
	  .text(zero_num + " of " + params.length + " selected hours (" + formatPct(zero_frac) + ") calm");
};

//general code for making a floodplot
function epwFloodPlot(data,params) {
	var min_value = params.min_value,
		max_value = params.max_value,
		steps = params.steps,	//number of steps in color scale
		scale_step = (max_value - min_value)/steps,
		legend_step = (max_value - min_value)/(steps+1),
		legend_scale = [],
		color_values = [];

	for (var i=0; i < steps + 2; i++) {
		var step = min_value + i*legend_step;
		legend_scale[i] = step.toFixed(1) + params.unit;
	};

	//define color map
	for (var i = 0; i < steps + 1; i++) {
		color_values.push(min_value + scale_step*i);
	}
	var colorScale = d3.scale.linear()
		.domain(color_values)
		.range(params.step_colors);

	//define grid and svg
	var gridSize = 30,
		h = gridSize/2,		//height of each row in the floodPlot
		w = gridSize/15,	//width of each column in the floodPlot
		rectPadding = 0;

	var margin = {top: 10, right: 120, bottom: 40, left: 40},
		width = w*366, //extra day to account for leap years
		height = h*24;

	var svg = d3.select(params.id).append("svg")
		.attr("width", width + margin.left + margin.right)
		.attr("height", height + margin.top + margin.bottom);

	//floodPlot
	svg.append("g")
		.attr("class", "floodPlot")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")")
		.selectAll("rect")
		.data(data, function(d) { return d.dayOfYear + ':' + d.hour; })
	  .enter().append("rect")
		.attr("x", function(d) { return d.dayOfYear * w; })
		.attr("y", function(d,i) { return height - (d.hour+1)*h; })
		.attr("width", function(d) { return w; })
		.attr("height", function(d) { return h; })
		.style("fill", function(d) { return colorScale(d.value); });

	//legend element
	var legend = svg.append("g")
		.attr("class","legend")
		.attr("transform", "translate(" + (width + margin.left) + "," + margin.top + ")")

	// color legend for color scale
	legend.selectAll("rect")
		.data(colorScale.domain())
	  .enter().append("rect")
		.attr("x", 5)
		.attr("y", function(d,i) {return height - (h*24/(steps+1))*(i+1); } )
		.attr("width", 15)
		.attr("height", h*24/8)
		.style("fill", function(d) {return colorScale(d); })

	// text label for the color scale
	legend.selectAll("text")
		.data(legend_scale)
	 .enter().append("text")
		.style("text-anchor", "left")
		.attr("x", 20)
		.attr("y", function(d,i) {return height - (h*24/(steps+1))*(i-0.1); } )
		.text(function(d, i) { return legend_scale[i]; });

	// add times scale to the figure
	var times = ["12am","1am","2am","3am","4am","5am","6am","7am","8am","9am","10am","11am","12pm","1pm","2pm","3pm","4pm","5pm","6pm","7pm","8pm","9pm","10pm","11pm","12am"];
	var y = d3.scale.linear()
			.range([height - h, height - 25*h])
			.domain([1,25]),
		yAxis = d3.svg.axis()
			.orient("left")
			.scale(y)
			.ticks(25)
			.tickFormat( function(d,i) { return times[i]; });
	svg.append("g")
		.attr("class", "axis")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")")
		.call(yAxis);

	var data_month = [{"label":"Jan"},{"label":"Feb"},{"label":"Mar"},{"label":"April"},{"label":"May"},{"label":"June"},{"label":"July"},{"label":"Aug"},{"label":"Sept"},{"label":"Oct"},{"label":"Nov"},{"label":"Dec"}];

	// text label for month
	svg.append("g")
		.attr("class", "axis")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")")
		.selectAll("text")
		.data(data_month)
	  .enter().append("text")
		.style("text-anchor", "middle")
		.attr("x", function(d,i) {return width*i/12 + w*15; } )
		.attr("y", height + 20)
		.text(function(d, i) { return data_month[i].label; });
};

//initialization code for the drybulb temperature crossfilter
function epwValueFilter(epw) {
    var data = epwDataDefault(epw,unitSystem); //encoding most of the object construction here
    //console.log(data);

    var formatNumber = d3.format(",d"),
        formatPercent = d3.format(".2%d");

    var xfilter = crossfilter(data),
        all = xfilter.groupAll(),
        month = xfilter.dimension(function(d) { return d.month; }),
        months = month.group(Math.floor);
        hour = xfilter.dimension(function(d) { return d.hour; }),
        hours = hour.group(Math.floor),
        dryBulbTemperature = xfilter.dimension(function(d) { return d.dryBulbTemperature; }),
        tempArray = epw.dryBulbTemperature();
        if (unitSystem == "IP") { tempArray = convertCtoF(tempArray) };
    var dryBulbTemperatureMin = Math.min.apply(Math,tempArray),
        dryBulbTemperatureMax = Math.max.apply(Math,tempArray),
        dryBulbTemperatureLowX = Math.floor(dryBulbTemperatureMin / 5)*5,
        dryBulbTemperatureHighX = Math.floor((dryBulbTemperatureMax + 5) / 5)*5,
        // Dewpoint is derived from vapor pressure (consistent with humidity ratio on
        // the psychrometric chart) rather than EPW field 7, so the filter and chart agree.
        dewPointTemperature = xfilter.dimension(function(d) {
            if (d.vaporPressure === null || !isFinite(d.vaporPressure) || d.vaporPressure <= 0) return -999;
            var lnPv = Math.log(d.vaporPressure / 611.657);
            var tdC = 243.04 * lnPv / (17.625 - lnPv);
            return unitSystem == "IP" ? 32 + tdC * 1.8 : tdC;
        }),
        tempArray = data
            .filter(function(d) { return d.vaporPressure !== null && isFinite(d.vaporPressure) && d.vaporPressure > 0; })
            .map(function(d) {
                var lnPv = Math.log(d.vaporPressure / 611.657);
                var tdC = 243.04 * lnPv / (17.625 - lnPv);
                return unitSystem == "IP" ? 32 + tdC * 1.8 : tdC;
            });
    var dewPointTemperatureMin = Math.min.apply(Math,tempArray),
        dewPointTemperatureMax = Math.max.apply(Math,tempArray),
        dewPointTemperatureLowX = Math.floor(dewPointTemperatureMin / 5)*5,
        dewPointTemperatureHighX = Math.floor((dewPointTemperatureMax + 5) / 5)*5,
        relativeHumidity = xfilter.dimension(function(d) { return d.relativeHumidity; }),
        tempArray = epw.relativeHumidity(),
        relativeHumidityMin = Math.min.apply(Math,tempArray),
        relativeHumidityMax = Math.max.apply(Math,tempArray),
        relativeHumidityLowX = Math.floor(relativeHumidityMin / 5)*5,
        relativeHumidityHighX = Math.floor((relativeHumidityMax + 5) / 5)*5,
        relativeHumiditys = relativeHumidity.group(Math.floor),
        outputDim = xfilter.dimension(function(d) { return d.index; });

    // Precompute wind rose direction groups on the crossfilter data
    for (var i = 0; i < data.length; i++) {
        data[i].directionGroup = Math.round(data[i].windDirection / 22.5);
        if (data[i].directionGroup === 0) { data[i].directionGroup = 16; }
        if (data[i].windSpeed === 0) { data[i].directionGroup = 0; }
    }
    var wrScaleSteps = unitSystem == "IP" ? [3.5,6.5,10.5,16.5,21.5,27] : [1.8,3.3,5.4,8.5,11.1,13.9];
    var wrUnit = unitSystem == "IP" ? "knots" : "m/s";
    var wrMaxValue = Math.max.apply(Math, data.map(function(d) { return d.windSpeed; }));

    window.updateWindRose = function(filteredData) {
        d3.select("#epwWindRose").selectAll("svg").remove();
        if (!filteredData) { filteredData = []; }
        var wrData = [];
        for (var j = 0; j < filteredData.length; j++) {
            wrData.push({
                index: filteredData[j].index,
                directionGroup: filteredData[j].directionGroup,
                value: filteredData[j].windSpeed
            });
        }
        var wrParams = {
            id: "#epwWindRose",
            min_value: 0,
            max_value: wrMaxValue,
            length: wrData.length,
            totalLength: data.length,
            directions: 16,
            steps: 6,
            scale_steps: wrScaleSteps,
            unit: wrUnit,
            labels: ['NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW','N'],
            step_colors: ['#d73027','#fc8d59','#fee090','#e0f3f8','#91bfdb','#4575b4'],
            legend_text: ['Light Air','Light Breeze','Gentle Breeze','Moderate Breeze','Fresh Breeze','Strong Breeze']
        };
        epwRadialChart(wrData, wrParams);
    };

    if (unitSystem == "IP") {
        dryBulbTemperatures = dryBulbTemperature.group(function(d) { return Math.floor(d / 2) * 2; }); // (d / 2) * 2
        dewPointTemperatures = dewPointTemperature.group(function(d) { return Math.floor(d / 2) * 2; }); // (d / 2) * 2
    } else {
        dryBulbTemperatures = dryBulbTemperature.group(function(d) { return Math.floor(d); });
        dewPointTemperatures = dewPointTemperature.group(function(d) { return Math.floor(d); });
    };

    // Wet bulb temperature dimension
    var wetBulbTemperature = xfilter.dimension(function(d) {
        if (d.wetBulbTemperature === null || !isFinite(d.wetBulbTemperature)) return -999;
        return unitSystem == "IP" ? 32 + d.wetBulbTemperature * 1.8 : d.wetBulbTemperature;
    });
    var wbArray = epw.wetBulbTemperature().filter(function(v) { return v !== null && isFinite(v); });
    if (unitSystem == "IP") { wbArray = convertCtoF(wbArray); }
    var wetBulbTemperatureLowX = Math.floor(Math.min.apply(Math, wbArray) / 5)*5,
        wetBulbTemperatureHighX = Math.floor((Math.max.apply(Math, wbArray) + 5) / 5)*5;
    var wetBulbTemperatures = unitSystem == "IP"
        ? wetBulbTemperature.group(function(d) { return Math.floor(d / 2) * 2; })
        : wetBulbTemperature.group(function(d) { return Math.floor(d); });

    // Enthalpy dimension (kJ/kg SI, BTU/lb IP)
    var enthalpyDim = xfilter.dimension(function(d) {
        if (d.moistAirEnthalpy === null || !isFinite(d.moistAirEnthalpy)) return -999;
        return d.moistAirEnthalpy * (unitSystem == "IP" ? 0.000429923 : 0.001);
    });
    var enthArray = epw.moistAirEnthalpy()
        .filter(function(v) { return v !== null && isFinite(v); })
        .map(function(v) { return v * (unitSystem == "IP" ? 0.000429923 : 0.001); });
    var enthalpyLowX = Math.floor(Math.min.apply(Math, enthArray) / 5)*5,
        enthalpyHighX = Math.floor((Math.max.apply(Math, enthArray) + 5) / 5)*5;
    var enthalpyStep = unitSystem == "IP" ? 1 : 5;
    var enthalpys = enthalpyDim.group(function(d) { return Math.floor(d / enthalpyStep) * enthalpyStep; });

    // Update chart titles with units based on unit system
    var tempUnit = unitSystem == "IP" ? "(\xB0F)" : "(\xB0C)";
    d3.select("#drybulb-temperature-chart .title").text("Drybulb Temperature " + tempUnit);
    d3.select("#dewpoint-temperature-chart .title").text("Dewpoint Temperature " + tempUnit);
    d3.select("#wetbulb-temperature-chart .title").text("Wetbulb Temperature " + tempUnit);
    d3.select("#rh-chart .title").text("Relative Humidity (%)");
    d3.select("#enthalpy-chart .title").text(unitSystem == "IP" ? "Enthalpy (BTU/lb)" : "Enthalpy (kJ/kg)");

    // Reset shared chart ID counter so reset(i) indices align with charts[] indices
    window._epwChartIdCounter = 0;

    var charts = [

        epwPolarChart()
            .dimension(month)
            .group(months)
            .radius(80)
            .innerRadius(22)
            .labels(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]),

        epwPolarChart()
            .dimension(hour)
            .group(hours)
            .radius(80)
            .innerRadius(22)
            .labelOffset(0)
            .labels(["12a","1a","2a","3a","4a","5a","6a","7a","8a","9a","10a","11a","12p","1p","2p","3p","4p","5p","6p","7p","8p","9p","10p","11p"]),

        epwBarChart()
            .dimension(dryBulbTemperature)
            .group(dryBulbTemperatures)
          .x(d3.scale.linear()
            .domain([dryBulbTemperatureLowX,dryBulbTemperatureHighX])
            .rangeRound([0, 10 * 45])), //make sure pixel width plus margins matches epwvis.css (sidebar width)

		epwBarChart()
            .dimension(dewPointTemperature)
            .group(dewPointTemperatures)
          .x(d3.scale.linear()
            .domain([dewPointTemperatureLowX,dewPointTemperatureHighX])
            .rangeRound([0, 10 * 45])), //make sure pixel width plus margins matches epwvis.css (sidebar width)

        epwBarChart()
            .dimension(relativeHumidity)
            .group(relativeHumiditys)
          .x(d3.scale.linear()
            .domain([relativeHumidityLowX,relativeHumidityHighX])
            .rangeRound([0, 10 * 45])), //make sure pixel width plus margins matches epwvis.css (sidebar width)

        epwBarChart()
            .dimension(wetBulbTemperature)
            .group(wetBulbTemperatures)
          .x(d3.scale.linear()
            .domain([wetBulbTemperatureLowX,wetBulbTemperatureHighX])
            .rangeRound([0, 10 * 45])), //make sure pixel width plus margins matches epwvis.css (sidebar width)

        epwBarChart()
            .dimension(enthalpyDim)
            .group(enthalpys)
          .x(d3.scale.linear()
            .domain([enthalpyLowX,enthalpyHighX])
            .rangeRound([0, 10 * 45])) //make sure pixel width plus margins matches epwvis.css (sidebar width)
      ];

    var chart = d3.selectAll(".xfilterChart")
      .data(charts)
      .each(function(chart) { chart.on("brush", renderAll).on("brushend", renderAll); });

    // Render the total.
    d3.selectAll("#xfilterTotal")
        .text(formatNumber(xfilter.size()));

    renderAll();

    // Renders the specified chart or list.
    function render(method) {
      d3.select(this).call(method);
    }

    // Whenever the brush moves, re-rendering everything.
    function renderAll() {
      chart.each(render);
      d3.select("#xfilterActive").text(formatNumber(all.value()));
      d3.select("#xfilterPercent").text(formatPercent(all.value()/xfilter.size()));
      if (window.updatePsychroPoints) {
        window.updatePsychroPoints(outputDim.top(Infinity));
      }
      if (window.updateWindRose) {
        window.updateWindRose(outputDim.top(Infinity));
      }
    }

    window.filter = function(filters) {
      filters.forEach(function(d, i) { charts[i].filter(d); });
      renderAll();
    };

    window.reset = function(i) {
      charts[i].filter(null);
      renderAll();
    };

    window.resetAll = function() {
      charts.forEach(function(c) { c.filter(null); });
      renderAll();
    };

    //set up examples
    tempFilterExamples = 'Filter the temperature profile by <a href="javascript:filter([null,[7,19],null])">day</a>, <a href="javascript:filter([[6,9],null,null])">summer months</a>, <a href="javascript:filter([[6,9],[7,19],null])">summer daytime</a>, or ';
    if (unitSystem == "IP") {
        tempFilterExamples = tempFilterExamples + '<a href="javascript:filter([null,null,[65,75]])">hours between 65&degF and 75&degF</a>.'
    } else {
        tempFilterExamples = tempFilterExamples + '<a href="javascript:filter([null,null,[15,25]])">hours between 15&degC and 25&degC</a>.'
    };
    document.getElementById("tempFilterExamples").innerHTML = tempFilterExamples;
};

//general code for making a bar chart with crossfilter
function epwBarChart() {
    var margin = {top: 10, right: 10, bottom: 20, left: 10},
        x,
        y = d3.scale.linear().range([65, 0]),
        id = window._epwChartIdCounter++,
        axis = d3.svg.axis().orient("bottom"),
        brush = d3.svg.brush(),
        brushDirty,
        dimension,
        group,
        round;

    function chart(div) {
      var width = x.range()[1],
          height = y.range()[0];

      y.domain([0, group.top(1)[0].value]);

      div.each(function() {
        var div = d3.select(this),
            g = div.select("g");

        // Create the skeletal chart.
        if (g.empty()) {
          div.select(".title").append("a")
              .attr("href", "javascript:reset(" + id + ")")
              .attr("class", "reset")
              .text("reset")
              .style("display", "none");

          g = div.append("svg")
              .attr("width", width + margin.left + margin.right)
              .attr("height", height + margin.top + margin.bottom)
            .append("g")
              .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

          g.append("clipPath")
              .attr("id", "clip-" + id)
            .append("rect")
              .attr("width", width)
              .attr("height", height);

          g.selectAll(".bar")
              .data(["background", "foreground"])
            .enter().append("path")
              .attr("class", function(d) { return d + " bar"; })
              .datum(group.all());

          g.selectAll(".foreground.bar")
              .attr("clip-path", "url(#clip-" + id + ")");

          g.append("g")
              .attr("class", "axis")
              .attr("transform", "translate(0," + height + ")")
              .call(axis);

          // Initialize the brush component with pretty resize handles.
          var gBrush = g.append("g").attr("class", "brush").call(brush);
          gBrush.selectAll("rect").attr("height", height);
          gBrush.selectAll(".resize").append("path").attr("d", resizePath);
        }

        // Only redraw the brush if set externally.
        if (brushDirty) {
          brushDirty = false;
          g.selectAll(".brush").call(brush);
          div.select(".title a").style("display", brush.empty() ? "none" : null);
          if (brush.empty()) {
            g.selectAll("#clip-" + id + " rect")
                .attr("x", 0)
                .attr("width", width);
          } else {
            var extent = brush.extent();
            g.selectAll("#clip-" + id + " rect")
                .attr("x", x(extent[0]))
                .attr("width", x(extent[1]) - x(extent[0]));
          }
        }

        g.selectAll(".bar").attr("d", barPath);
      });

      function barPath(groups) {
        var path = [],
            i = -1,
            n = groups.length,
            d;
        while (++i < n) {
          d = groups[i];
          path.push("M", x(d.key), ",", height, "V", y(d.value), "h9V", height);
        }
        return path.join("");
      };

      function resizePath(d) {
        var e = +(d == "e"),
            x = e ? 1 : -1,
            y = height / 3;
        return "M" + (.5 * x) + "," + y
            + "A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6)
            + "V" + (2 * y - 6)
            + "A6,6 0 0 " + e + " " + (.5 * x) + "," + (2 * y)
            + "Z"
            + "M" + (2.5 * x) + "," + (y + 8)
            + "V" + (2 * y - 8)
            + "M" + (4.5 * x) + "," + (y + 8)
            + "V" + (2 * y - 8);
      };
    }

    brush.on("brushstart.chart", function() {
      var div = d3.select(this.parentNode.parentNode.parentNode);
      div.select(".title a").style("display", null);
    });

    brush.on("brush.chart", function() {
      var g = d3.select(this.parentNode),
          extent = brush.extent();
      if (round) g.select(".brush")
          .call(brush.extent(extent = extent.map(round)))
        .selectAll(".resize")
          .style("display", null);
      g.select("#clip-" + id + " rect")
          .attr("x", x(extent[0]))
          .attr("width", x(extent[1]) - x(extent[0]));
      dimension.filterRange(extent);
    });

    brush.on("brushend.chart", function() {
      if (brush.empty()) {
        var div = d3.select(this.parentNode.parentNode.parentNode);
        div.select(".title a").style("display", "none");
        div.select("#clip-" + id + " rect").attr("x", null).attr("width", "100%");
        dimension.filterAll();
      }
    });

    chart.margin = function(_) {
      if (!arguments.length) return margin;
      margin = _;
      return chart;
    };

    chart.x = function(_) {
      if (!arguments.length) return x;
      x = _;
      axis.scale(x);
      brush.x(x);
      return chart;
    };

    chart.y = function(_) {
      if (!arguments.length) return y;
      y = _;
      return chart;
    };

    chart.dimension = function(_) {
      if (!arguments.length) return dimension;
      dimension = _;
      return chart;
    };

    chart.filter = function(_) {
      if (_) {
        brush.extent(_);
        dimension.filterRange(_);
      } else {
        brush.clear();
        dimension.filterAll();
      }
      brushDirty = true;
      return chart;
    };

    chart.group = function(_) {
      if (!arguments.length) return group;
      group = _;
      return chart;
    };

    chart.round = function(_) {
      if (!arguments.length) return round;
      round = _;
      return chart;
    };

    return d3.rebind(chart, brush, "on");
};

// Polar (circular) bar chart for cyclic dimensions (month, hour) with wrap-around brush selection.
// Drag clockwise from any starting segment to brush a contiguous arc; dragging past 12 o'clock
// wraps around so e.g. winter months (Nov–Jan) or night hours (10pm–2am) can be selected.
function epwPolarChart() {
    var id = window._epwChartIdCounter++,
        dimension,
        group,
        labels        = [],
        outerRadius   = 80,
        innerRadius   = 24,
        labelOffset   = 0.5,    // 0 = segment start, 0.5 = segment center
        filterExtent  = null,   // [startSeg, endSeg] 0-based, or null
        brushDirty    = false,
        dispatch      = d3.dispatch("brush", "brushend");

    function chart(div) {
        div.each(function() {
            var container = d3.select(this);
            var groupData = group.all();
            var n         = groupData.length;
            var maxVal    = d3.max(groupData, function(d) { return d.value; }) || 1;
            var angleStep = (2 * Math.PI) / n;
            var rScale    = d3.scale.linear().domain([0, maxVal]).range([innerRadius, outerRadius]);

            var svgW = (outerRadius + 22) * 2;
            var svgH = (outerRadius + 22) * 2;
            var cx = svgW / 2, cy = svgH / 2;

            var svg = container.select("svg");

            if (svg.empty()) {
                container.select(".title").append("a")
                    .attr("href", "javascript:reset(" + id + ")")
                    .attr("class", "reset")
                    .text("reset")
                    .style("display", "none");

                svg = container.append("svg")
                    .attr("width",  svgW)
                    .attr("height", svgH)
                    .style("cursor", "crosshair");

                var g = svg.append("g")
                    .attr("class", "polar-g")
                    .attr("transform", "translate(" + cx + "," + cy + ")");

                g.append("g").attr("class", "polar-bars-bg");
                g.append("path").attr("class", "polar-selection");
                g.append("g").attr("class", "polar-bars-fg");
                g.append("g").attr("class", "polar-labels");

                var dragState = { active: false, prevAngle: 0, sweepAngle: 0, startSeg: 0 };

                function rawAngle(node) {
                    var m = d3.mouse(node);
                    var a = Math.atan2(m[0] - cx, -(m[1] - cy));
                    return a < 0 ? a + 2 * Math.PI : a;
                }

                function angleDelta(prev, curr) {
                    var d = curr - prev;
                    if (d >  Math.PI) d -= 2 * Math.PI;
                    if (d < -Math.PI) d += 2 * Math.PI;
                    return d;
                }

                svg.on("mousedown", function() {
                    var a = rawAngle(svg.node());
                    dragState.active     = true;
                    dragState.prevAngle  = a;
                    dragState.sweepAngle = 0;
                    dragState.startSeg   = Math.floor(a / angleStep) % n;
                    d3.event.preventDefault();
                    redrawViz(container, svg, g, n, groupData, rScale, angleStep, dragState.startSeg, 0);
                });

                svg.on("mousemove", function() {
                    if (!dragState.active) return;
                    var a = rawAngle(svg.node());
                    var delta = angleDelta(dragState.prevAngle, a);
                    dragState.sweepAngle = Math.max(0, Math.min(2 * Math.PI - angleStep * 0.5, dragState.sweepAngle + delta));
                    dragState.prevAngle  = a;
                    redrawViz(container, svg, g, n, groupData, rScale, angleStep, dragState.startSeg, dragState.sweepAngle);
                    dispatch.brush.call(chart);
                });

                function endDrag() {
                    if (!dragState.active) return;
                    dragState.active = false;
                    if (dragState.sweepAngle < angleStep * 0.5) {
                        // tiny drag / click = clear filter
                        filterExtent = null;
                        dimension.filterAll();
                        container.select(".title a.reset").style("display", "none");
                        redrawViz(container, svg, g, n, groupData, rScale, angleStep, null, 0);
                    } else {
                        var numSegs  = Math.round(dragState.sweepAngle / angleStep);
                        var startSeg = dragState.startSeg;
                        var endSeg   = (startSeg + numSegs - 1 + n) % n;
                        filterExtent = [startSeg, endSeg];
                        applyFilter(groupData, n, startSeg, endSeg);
                        container.select(".title a.reset").style("display", null);
                        redrawViz(container, svg, g, n, groupData, rScale, angleStep, startSeg, numSegs * angleStep);
                    }
                    dispatch.brushend.call(chart);
                }

                svg.on("mouseup",    endDrag);
                svg.on("mouseleave", endDrag);
            }

            // Redraw bars on every renderAll call (crossfilter changes bar heights)
            var g = svg.select(".polar-g");
            drawBars(g, n, groupData, rScale, angleStep);

            if (brushDirty) {
                brushDirty = false;
                if (filterExtent) {
                    var startSeg  = filterExtent[0];
                    var numSegs   = (filterExtent[1] - filterExtent[0] + n) % n + 1;
                    redrawViz(container, svg, g, n, groupData, rScale, angleStep, startSeg, numSegs * angleStep);
                    container.select(".title a.reset").style("display", null);
                } else {
                    redrawViz(container, svg, g, n, groupData, rScale, angleStep, null, 0);
                    container.select(".title a.reset").style("display", "none");
                }
            }
        });
    }

    function drawBars(g, n, groupData, rScale, angleStep) {
        // In d3 v3 the original selection only covers the UPDATE set after enter().append().
        // Re-select after enter so attributes are applied to newly created elements too.
        var bgGroup = g.select(".polar-bars-bg");
        bgGroup.selectAll("path.pbg").data(groupData).enter().append("path").attr("class", "pbg");
        bgGroup.selectAll("path.pbg")
            .attr("d", function(d, i) {
                return sectorPath(i * angleStep, (i + 1) * angleStep, innerRadius, outerRadius);
            })
            .style("fill", "#ccc")
            .style("stroke", "white")
            .style("stroke-width", "0.5px");

        var fgGroup = g.select(".polar-bars-fg");
        fgGroup.selectAll("path.pfg").data(groupData).enter().append("path").attr("class", "pfg");
        fgGroup.selectAll("path.pfg")
            .attr("d", function(d, i) {
                return sectorPath(i * angleStep, (i + 1) * angleStep, innerRadius, Math.max(innerRadius, rScale(d.value)));
            })
            .style("fill", "steelblue")
            .style("stroke", "white")
            .style("stroke-width", "0.5px");

        var lblGroup = g.select(".polar-labels");
        lblGroup.selectAll("text.plbl").data(groupData).enter().append("text").attr("class", "plbl");
        lblGroup.selectAll("text.plbl")
            .attr("transform", function(d, i) {
                var angle = (i + labelOffset) * angleStep;
                var r = outerRadius + 13;
                return "translate(" + (r * Math.sin(angle)).toFixed(2) + "," + (-r * Math.cos(angle)).toFixed(2) + ")";
            })
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font", "9px sans-serif")
            .text(function(d, i) { return labels[i] !== undefined ? labels[i] : d.key; });
    }

    function redrawViz(container, svg, g, n, groupData, rScale, angleStep, startSeg, sweepAngle) {
        drawBars(g, n, groupData, rScale, angleStep);
        var selPath = "";
        if (startSeg !== null && sweepAngle >= angleStep * 0.5) {
            var sa = startSeg * angleStep;
            var ea = sa + sweepAngle;
            selPath = sectorPath(sa, ea, innerRadius, outerRadius + 8);
        }
        g.select(".polar-selection")
            .attr("d", selPath)
            .style("fill", "steelblue")
            .style("fill-opacity", 0.2)
            .style("stroke", "steelblue")
            .style("stroke-width", "1px");
    }

    function applyFilter(groupData, n, startSeg, endSeg) {
        var keys = groupData.map(function(d) { return d.key; });
        if (startSeg <= endSeg) {
            dimension.filterRange([keys[startSeg], keys[endSeg] + 1]);
        } else {
            // wrap-around: e.g. startSeg=10, endSeg=2 includes keys 10,11,0,1,2
            var minKey = keys[startSeg];
            var maxKey = keys[endSeg];
            dimension.filterFunction(function(d) { return d >= minKey || d <= maxKey; });
        }
    }

    // Arc sector path: angles measured clockwise from 12 o'clock (north)
    function sectorPath(startAngle, endAngle, inner, outer) {
        var largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
        var sinS = Math.sin(startAngle), cosS = Math.cos(startAngle);
        var sinE = Math.sin(endAngle),   cosE = Math.cos(endAngle);
        return ["M", (outer*sinS).toFixed(3), (-outer*cosS).toFixed(3),
                "A", outer, outer, 0, largeArc, 1, (outer*sinE).toFixed(3), (-outer*cosE).toFixed(3),
                "L", (inner*sinE).toFixed(3), (-inner*cosE).toFixed(3),
                "A", inner, inner, 0, largeArc, 0, (inner*sinS).toFixed(3), (-inner*cosS).toFixed(3),
                "Z"].join(" ");
    }

    chart.dimension = function(_) {
        if (!arguments.length) return dimension;
        dimension = _;
        return chart;
    };

    chart.group = function(_) {
        if (!arguments.length) return group;
        group = _;
        return chart;
    };

    chart.labels = function(_) {
        if (!arguments.length) return labels;
        labels = _;
        return chart;
    };

    chart.radius = function(_) {
        if (!arguments.length) return outerRadius;
        outerRadius = _;
        return chart;
    };

    chart.innerRadius = function(_) {
        if (!arguments.length) return innerRadius;
        innerRadius = _;
        return chart;
    };

    chart.labelOffset = function(_) {
        if (!arguments.length) return labelOffset;
        labelOffset = _;
        return chart;
    };

    chart.filter = function(_) {
        if (_) {
            // _ = [minKey, maxKey] as used by window.filter() / window.reset()
            var groupData = group.all();
            var keys = groupData.map(function(d) { return d.key; });
            var n = keys.length;
            var startSeg = -1, endSeg = -1;
            for (var i = 0; i < n; i++) {
                if (keys[i] >= _[0] && startSeg === -1) startSeg = i;
                if (keys[i] < _[1]) endSeg = i;
            }
            if (startSeg === -1) startSeg = 0;
            if (endSeg   === -1) endSeg   = n - 1;
            filterExtent = [startSeg, endSeg];
            dimension.filterRange(_);
        } else {
            filterExtent = null;
            dimension.filterAll();
        }
        brushDirty = true;
        return chart;
    };

    return d3.rebind(chart, dispatch, "on");
}

//initialization code for the psychrometric chart
function epwPsychroChart(epw) {
    // psychrolib calculations always run in SI
    psychrolib.SetUnitSystem(psychrolib.SI);

    // Use the average station pressure from the EPW data so RH curves align
    // with data points (which were also computed at actual station pressure).
    // EPW field 9 = Atmospheric Station Pressure (Pa).
    var pressureData = epw.getDataByField(9).filter(function(p) { return isFinite(p) && p > 0; });
    var ATM = pressureData.length > 0
        ? pressureData.reduce(function(a, b) { return a + b; }, 0) / pressureData.length
        : 101325;

    var isIP = (unitSystem === "IP");

    // Helpers: convert between SI and display units
    function dbToDisp(tC)   { return isIP ? (32 + tC * 9/5) : tC; }
    function dbToSI(tDisp)  { return isIP ? ((tDisp - 32) * 5/9) : tDisp; }
    function hrToDisp(hrKg) { return isIP ? hrKg * 7000 : hrKg * 1000; }

    // Build display data using epwDataDefault (same source as crossfilter)
    // dryBulbTemperature is already in display units; humidityRatio is always kg/kg
    var rawData = epwDataDefault(epw, unitSystem);
    var displayData = [];
    rawData.forEach(function(d) {
        if (d.humidityRatio !== null && isFinite(d.humidityRatio) &&
            d.dryBulbTemperature !== null && isFinite(d.dryBulbTemperature)) {
            displayData.push({
                index:  d.index,
                db:     d.dryBulbTemperature,
                hr:     hrToDisp(d.humidityRatio),
                rh:     d.relativeHumidity,
                month:  d.month,
                day:    d.day,
                hour:   d.hour
            });
        }
    });
    if (displayData.length === 0) return;

    // Axis ranges
    var xPad  = isIP ? 5 : 2;
    var dbMin = d3.min(displayData, function(d) { return d.db; }) - xPad;
    var dbMax = d3.max(displayData, function(d) { return d.db; }) + xPad;
    var hrMax = d3.max(displayData, function(d) { return d.hr; }) * 1.1;

    // Chart geometry
    var margin = {top: 20, right: 130, bottom: 50, left: 70};
    var width  = 720;
    var height = 450;

    var x = d3.scale.linear().domain([dbMin, dbMax]).range([0, width]);
    var y = d3.scale.linear().domain([0, hrMax]).range([height, 0]);

    var svg = d3.select("#epwPsychroChart").append("svg")
        .attr("width",  width  + margin.left + margin.right)
        .attr("height", height + margin.top  + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // --- Saturation curve (100% RH) ------------------------------------
    var nSteps    = 300;
    var tStep     = (dbMax - dbMin) / nSteps;
    var satCurve  = [];
    for (var t = dbMin; t <= dbMax + tStep / 2; t += tStep) {
        try {
            var hrKg = psychrolib.GetHumRatioFromRelHum(dbToSI(t), 1.0, ATM);
            var hrD  = hrToDisp(hrKg);
            satCurve.push({db: t, hr: hrD});
        } catch(e) {}
    }

    // Build SVG clip-path: region below the saturation curve
    // Saturation curve runs low-left → high-right in screen y (it rises from bottom to top).
    var clipId = "psychro-clip-" + Math.floor(Math.random() * 1e6);
    (function() {
        var pts = satCurve.map(function(d) { return [x(d.db), y(d.hr)]; });
        if (pts.length < 2) return;

        var clipD = "M" + pts[0][0] + "," + pts[0][1];
        for (var i = 1; i < pts.length; i++) {
            clipD += " L" + pts[i][0] + "," + pts[i][1];
        }
        // close: down-right corner → down-left corner → back to start
        clipD += " L" + width  + "," + height;
        clipD += " L0,"         + height;
        clipD += " L0,"         + pts[0][1];
        clipD += " Z";

        svg.append("defs").append("clipPath")
            .attr("id", clipId)
            .append("path")
            .attr("d", clipD);
    }());

    // --- Grid lines (clipped so they terminate at the saturation curve) --
    var gridGroup = svg.append("g")
        .attr("class", "psychro-grid")
        .attr("clip-path", "url(#" + clipId + ")");

    // Vertical lines (constant temperature)
    x.ticks(10).forEach(function(tv) {
        gridGroup.append("line")
            .attr("x1", x(tv)).attr("x2", x(tv))
            .attr("y1", 0)    .attr("y2", height)
            .attr("stroke", "lightgray").attr("stroke-width", 0.5);
    });

    // Horizontal lines (constant humidity ratio)
    y.ticks(8).forEach(function(hv) {
        gridGroup.append("line")
            .attr("x1", 0)    .attr("x2", width)
            .attr("y1", y(hv)).attr("y2", y(hv))
            .attr("stroke", "lightgray").attr("stroke-width", 0.5);
    });

    // --- Binned heatmap --------------------------------------------------
    var gridCols = 60, gridRows = 45;
    var binW = (dbMax - dbMin) / gridCols;
    var binH = hrMax / gridRows;
    var cellPxW = Math.ceil(width  / gridCols) + 1;
    var cellPxH = Math.ceil(height / gridRows) + 1;

    var heatColorScale = d3.scale.linear()
        .domain([0, 0.14, 0.29, 0.43, 0.57, 0.71, 0.86, 1])
        .range(['darkblue', 'blue', 'cyan', 'greenyellow', 'yellow', 'orange', 'red', 'darkred']);

    // --- Legend variables (DOM elements created after heatmap group) -----
    var legendStops   = [0, 0.14, 0.29, 0.43, 0.57, 0.71, 0.86, 1];
    var legendSwatchH = 14, legendSwatchW = 12, legendGap = 2;
    var legendX = 10;
    var legendY = 10;
    var legendLabels  = [];   // populated below, after heatmap group

    function updateLegendLabels(maxCount) {
        if (!legendLabels.length) return;   // DOM not yet created
        // Compute log-spaced target values, then enforce strict ascending
        // uniqueness so no two swatches ever show the same number.
        var vals = legendStops.map(function(norm) {
            return Math.round(Math.exp(norm * Math.log(maxCount + 1)) - 1);
        });
        vals[0] = Math.max(1, vals[0]);
        for (var i = 1; i < vals.length; i++) {
            vals[i] = Math.max(vals[i - 1] + 1, vals[i]);
        }
        vals.forEach(function(v, i) {
            // Blank the label for swatches that exceed the actual max
            legendLabels[i].text(v > maxCount ? "" : String(v));
        });
    }

    var heatGroup = svg.append("g")
        .attr("class", "psychro-heatmap")
        .attr("clip-path", "url(#" + clipId + ")");

    // Pre-build one rect per cell
    var heatCells = [];
    for (var hrow = 0; hrow < gridRows; hrow++) {
        for (var hcol = 0; hcol < gridCols; hcol++) {
            var hrect = heatGroup.append("rect")
                .attr("x",      x(dbMin + hcol * binW))
                .attr("y",      y((hrow + 1) * binH))
                .attr("width",  cellPxW)
                .attr("height", cellPxH)
                .attr("fill",   "none");
            heatCells.push({ rect: hrect, row: hrow, col: hcol });
        }
    }

    function drawHeatmap(activeData) {
        var counts = {};
        var maxCount = 0;
        activeData.forEach(function(d) {
            var col = Math.floor((d.db - dbMin) / binW);
            var row = Math.floor(d.hr / binH);
            col = Math.max(0, Math.min(gridCols - 1, col));
            row = Math.max(0, Math.min(gridRows - 1, row));
            var key = row * gridCols + col;
            counts[key] = (counts[key] || 0) + 1;
            if (counts[key] > maxCount) maxCount = counts[key];
        });
        heatCells.forEach(function(c) {
            var cnt = counts[c.row * gridCols + c.col] || 0;
            if (cnt === 0) {
                c.rect.attr("fill", "none");
            } else {
                var norm = Math.log(cnt + 1) / Math.log(maxCount + 1);
                c.rect.attr("fill", heatColorScale(norm)).attr("opacity", 1.0);
            }
        });
        updateLegendLabels(maxCount);
    }

    drawHeatmap(displayData);

    // --- Legend DOM (appended after heatmap so it renders on top) --------
    var legendTotalH = legendStops.length * (legendSwatchH + legendGap) + 16;
    var legendGroup = svg.append("g").attr("class", "psychro-legend");

    legendGroup.append("rect")
        .attr("x",      legendX - 4)
        .attr("y",      legendY - 4)
        .attr("width",  legendSwatchW + 42)
        .attr("height", legendTotalH)
        .attr("fill",   "white")
        .attr("opacity", 0.75)
        .attr("rx", 3);

    legendGroup.append("text")
        .attr("x", legendX)
        .attr("y", legendY + 8)
        .attr("font-size", "10px")
        .attr("fill", "#555")
        .text("hrs/bin");

    legendStops.forEach(function(norm, i) {
        legendGroup.append("rect")
            .attr("x",      legendX)
            .attr("y",      legendY + 14 + i * (legendSwatchH + legendGap))
            .attr("width",  legendSwatchW)
            .attr("height", legendSwatchH)
            .attr("fill",   heatColorScale(norm));
        legendLabels[i] = legendGroup.append("text")
            .attr("x", legendX + legendSwatchW + 4)
            .attr("y", legendY + 14 + i * (legendSwatchH + legendGap) + legendSwatchH - 3)
            .attr("font-size", "10px")
            .attr("fill", "#555");
    });
    drawHeatmap(displayData); // second pass: legend DOM now exists, fills labels

    // --- RH curves -------------------------------------------------------
    var rhValues = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    var lineFn = d3.svg.line()
        .x(function(d) { return x(d.db); })
        .y(function(d) { return y(d.hr); })
        .defined(function(d) {
            return d.hr !== null && isFinite(d.hr) && d.hr >= 0 && d.hr <= hrMax * 1.05;
        });

    var rhGroup = svg.append("g").attr("class", "psychro-rh-lines");

    rhValues.forEach(function(rh, rhIndex) {
        var pts = [];
        for (var t = dbMin; t <= dbMax + tStep / 2; t += tStep) {
            var hrKg = null;
            try { hrKg = psychrolib.GetHumRatioFromRelHum(dbToSI(t), rh / 100, ATM); }
            catch(e) {}
            pts.push({ db: t, hr: hrKg !== null ? hrToDisp(hrKg) : null });
        }

        rhGroup.append("path")
            .datum(pts)
            .attr("d", lineFn)
            .attr("fill", "none")
            .attr("stroke", "lightgray")
            .attr("stroke-width", rh === 100 ? 1.5 : 0.8);

        // Label: centered over the rightmost valid point, staggered every other line
        var labelPt = null;
        for (var j = pts.length - 1; j >= 0; j--) {
            if (pts[j].hr !== null && pts[j].hr >= 0 && pts[j].hr <= hrMax) {
                labelPt = pts[j];
                break;
            }
        }
        if (labelPt) {
            // No offset for low RH; stagger + drop 40–100% to avoid clipping at chart top
            var yOffset = 0;
            if (rh >= 40) { yOffset = (rhIndex % 2 === 0) ? -6 + 12 : -24 + 12; }
            rhGroup.append("text")
                .attr("x", x(labelPt.db))
                .attr("y", y(labelPt.hr) + yOffset)
                .attr("text-anchor", "middle")
                .attr("font-size", "9px")
                .attr("fill", "#aaa")
                .text(rh + "% RH");
        }
    });

    // --- Axes ------------------------------------------------------------
    var xAxis = d3.svg.axis().scale(x).orient("bottom").ticks(10);
    var yAxis = d3.svg.axis().scale(y).orient("right").ticks(8);

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(" + width + ",0)")
        .call(yAxis);

    // --- Dewpoint temperature secondary y-axis (left) --------------------
    // Ticks share the same pixel positions as the humidity ratio axis.
    // For each HR tick, compute dewpoint via: Pv = hrKg * ATM / (0.621945 + hrKg),
    // then Td = 243.04 * ln(Pv/611.657) / (17.625 - ln(Pv/611.657)).
    var dewpointAxisTicks = y.ticks(8).filter(function(v) { return v > 0; });
    var dewpointAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .tickValues(dewpointAxisTicks)
        .tickFormat(function(hrDisp) {
            var hrKg = hrDisp / (isIP ? 7000 : 1000);
            if (hrKg <= 0) return "";
            var Pv = hrKg * ATM / (0.621945 + hrKg);
            if (Pv <= 0) return "";
            var lnPv = Math.log(Pv / 611.657);
            var tdC = 243.04 * lnPv / (17.625 - lnPv);
            return (isIP ? (32 + tdC * 1.8) : tdC).toFixed(1) + (isIP ? "\xB0F" : "\xB0C");
        });

    svg.append("g")
        .attr("class", "axis")
        .call(dewpointAxis);

    // x-axis label
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 42)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .text(isIP ? "Dry Bulb Temperature (\xB0F)" : "Dry Bulb Temperature (\xB0C)");

    // y-axis label (right side, rotated)
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(height / 2))
        .attr("y", width + 45)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .text(isIP ? "Humidity Ratio (gr/lb)" : "Humidity Ratio (g/kg)");

    // y-axis label (left side, rotated) - dewpoint temperature
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(height / 2))
        .attr("y", -margin.left + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .text(isIP ? "Dewpoint Temperature (\xB0F)" : "Dewpoint Temperature (\xB0C)");

    // --- Hours selected label -------------------------------------------
    var totalHours = displayData.length;
    var formatPct  = d3.format(".1%");

    var hoursLabel = svg.append("text")
        .attr("class", "legend-header")
        .attr("x", 0)
        .attr("y", -6)
        .attr("font-size", "11px")
        .attr("fill", "#555")
        .text(totalHours + " of " + totalHours + " hours (100%) selected");

    // --- Expose update function for crossfilter --------------------------
    window.updatePsychroPoints = function(filteredData) {
        if (!filteredData) return;
        var filteredSet = {};
        filteredData.forEach(function(d) { filteredSet[d.index] = true; });
        var activeDisplayData = displayData.filter(function(d) { return filteredSet[d.index]; });
        drawHeatmap(activeDisplayData);
        var n = activeDisplayData.length;
        hoursLabel.text(n + " of " + totalHours + " hours (" + formatPct(n / totalHours) + ") selected");
    };
};
