/*-------------------------------------------------------------------------
 * epwCharts.js
 * Chart library for epwvis
 *
 * DEPENDENCIES
 *  - d3.js
 *-------------------------------------------------------------------------*/

function clearEPWCharts() {
    d3.selectAll("svg").remove();
};

function epwData(epw,value){
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
	
	var zero_num = 0,
	    zero_frac = 0;

	if (zero_num != null) { 
		zero_num = mapped_data[0][0];
		zero_frac = zero_num/params.length;
	}; // zero days
	
	//take nested data and transform into arc_data, and get max radius for scaling
	var arc_data = [],
        max_radius = 0;
	for (var i=1; i <= params.directions; i++) {
		var c = mapped_data[i],			
			prior_radius = 0;
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
		
	var scaling_factor = (0.8*radius)/max_radius; //set max_radius to 1
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
      
	//number of calm days
	formatNumber = d3.format(".1%d");
	svg.append("g")
      .attr("class","legend-header")
	  .attr("transform", "translate(" + 0 + "," + (-cy) + ")")
	  .append("text")
	  .style("text-anchor", "right")
	  .text(zero_num + " of " + params.length + " hours (" + formatNumber(zero_frac) + ") calm")	
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
function epwTempFilter(epw) {
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
    //console.log(data);
    
    var formatNumber = d3.format(",d"),
        formatPercent = d3.format(".2%d")
        min_value = Math.min.apply(Math,value), 
		max_value = Math.max.apply(Math,value);
    
    var xfilter = crossfilter(data),
        all = xfilter.groupAll(),
        month = xfilter.dimension(function(d) { return d.month; }),
        months = month.group(Math.floor);
        hour = xfilter.dimension(function(d) { return d.hour; }),
        hours = hour.group(Math.floor);
        value = xfilter.dimension(function(d) { return d.value; }),
        //values = value.group(function(d) { return Math.floor(d / 2) * 2; }),
        lowerX = Math.floor(min_value / 5)*5,
        upperX = Math.floor((max_value+5) / 5)*5;
       
    if (unitSystem == "IP") {
        values = value.group(function(d) { return Math.floor(d / 2) * 2; });
    } else {
        values = value.group(function(d) { return Math.floor(d); });
    };

    var charts = [

        epwBarChart()
            .dimension(month)
            .group(months)
          .x(d3.scale.linear()
            .domain([1, 12.5])
            .rangeRound([0, 20 * 12.5])),

        epwBarChart()
            .dimension(hour)
            .group(hours)
          .x(d3.scale.linear()
            .domain([1, 25])
            .rangeRound([0, 20 * 25])),

        epwBarChart()
            .dimension(value)
            .group(values)            
          .x(d3.scale.linear()
            .domain([lowerX,upperX])
            .rangeRound([0, 10 * 90]))

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
    }

    window.filter = function(filters) {
      filters.forEach(function(d, i) { charts[i].filter(d); });
      renderAll();
    };

    window.reset = function(i) {
      charts[i].filter(null);
      renderAll();
    };
    
    //set up examples    
    tempFilterExamples = 'Filter the temperature profile by <a href="javascript:filter([null,[7,19],null])">day</a>, <a href="javascript:filter([[6,8],null,null])">summer months</a>, <a href="javascript:filter([[6,8],[7,19],null])">summer daytime</a>, or ';
    if (unitSystem == "IP") {
        tempFilterExamples = tempFilterExamples + '<a href="javascript:filter([null,null,[65,75]])">hours between 65&degF and 75&degF</a>.'
    } else {
        tempFilterExamples = tempFilterExamples + '<a href="javascript:filter([null,null,[15,25]])">hours between 15&degC and 25&degC</a>.'
    };
    document.getElementById("tempFilterExamples").innerHTML = tempFilterExamples;
};

//general code for making a bar chart with crossfilter
function epwBarChart() {
    if (!epwBarChart.id) epwBarChart.id = 0;

    var margin = {top: 10, right: 10, bottom: 20, left: 10},
        x,
        y = d3.scale.linear().range([100, 0]),
        id = epwBarChart.id++,
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
