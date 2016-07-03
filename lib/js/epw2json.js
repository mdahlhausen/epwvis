/*-------------------------------------------------------------------------
 * epw2json.js
 * Parses an epw file into a JSON object
 *-------------------------------------------------------------------------*/
function epw2json(raw) {  
  //read raw file
  var epw_raw = d3.csv.parseRows(raw);
  
  //See the EPW IDD specification for epw file format
  var epw = {
	  _location : {},
	  designCondition : {},
	  designConditions : {},
	  typicalExtremePeriod : {},
	  typicalExtremePeriods : {},
	  groundTemperature : {},
	  groundTemperatures : {},
	  holiday : {},
	  holidayDaylightSavings : {},
	  comments1 : {},
	  comments2 : {},
	  dataPeriod : {},
	  dataPeriods : {},
	  weatherData : []
  };
  
  //epw object functions for getting and setting data
  epw.getStationLocation = function() {
	return this.stationLocation;
  };
  epw.setStationLocation = function(stationLocation) {
	this.stationLocation = stationLocation;
  };

  //general method for getting data by field number in weather data
  epw.getDataByField = function(fieldNumber) {
	data = [];
	//field 5 is uncertainty data and is not a number
	if (fieldNumber == 5) {
	  this.weatherData.forEach(function(row) {
	    data.push(row[fieldNumber]);
	  });
	} else {
	  this.weatherData.forEach(function(row) {
	    data.push(+row[fieldNumber]);
	  });
	};
	return data;
  };
  
  //data fields in weather data
  epw.year = function() {
	data = this.getDataByField(0);
	return data;
  };
  epw.month = function() {
	data = this.getDataByField(1);
	return data;
  };
  epw.day = function() {
	data = this.getDataByField(2);
	return data;
  };
  epw.hour = function() {
	data = this.getDataByField(3);
	return data;
  };
  epw.minute = function() {
	data = this.getDataByField(4);
	return data;
  };
  epw.uncertainty = function() {
	data = this.getDataByField(5);
	return data;
  };
  epw.dryBulbTemperature = function() {
	data = this.getDataByField(6);
	return data;
  };
  epw.dewPointTemperature = function() {
	data = this.getDataByField(7);
	return data;
  };
  epw.relativeHumidity = function() {
	data = this.getDataByField(8);
	return data;
  };
  epw.atmosphericStationPressure = function() {
	data = this.getDataByField(9);
	return data;
  };
  epw.extraterrestrialHorizontalRadiation = function() {
	data = this.getDataByField(10);
	return data;
  };
  epw.extraterrestrialDirectNormalRadiation = function() {
	data = this.getDataByField(11);
	return data;
  };
  epw.horizontalInfraredRadiationIntensity = function() {
	data = this.getDataByField(12);
	return data;
  };
  epw.globalHorizontalRadiation = function() {
	data = this.getDataByField(13);
	return data;
  };
  epw.directNormalRadiation = function() {
	data = this.getDataByField(14);
	return data;
  };
  epw.diffuseHorizontalRadiation = function() {
	data = this.getDataByField(15);
	return data;
  };
  epw.globalHorizontalIlluminance = function() {
	data = this.getDataByField(16);
	return data;
  };
  epw.directNormalIlluminance = function() {
	data = this.getDataByField(17);
	return data;
  };
  epw.diffuseHorizontalIlluminance = function() {
	data = this.getDataByField(18);
	return data;
  };
  epw.zenithLuminance = function() {
	data = this.getDataByField(19);
	return data;
  };
  epw.windDirection = function() {
	data = this.getDataByField(20);
	return data;
  };
  epw.windSpeed = function() {
	data = this.getDataByField(21);
	return data;
  };
  epw.totalSkyCover = function() {
	data = this.getDataByField(22);
	return data;
  };
  epw.opaqueSkyCover = function() {
	data = this.getDataByField(23);
	return data;
  };
  epw.visibility = function() {
	data = this.getDataByField(24);
	return data;
  };
  epw.ceilingHeight = function() {
	data = this.getDataByField(25);
	return data;
  };
  epw.presentWeatherObservation = function() {
	data = this.getDataByField(26);
	return data;
  };
  epw.presentWeatherCodes = function() {
	data = this.getDataByField(27);
	return data;
  };
  epw.precipitableWater = function() {
	data = this.getDataByField(28);
	return data;
  };
  epw.aerosolOpticalDepth = function() {
	data = this.getDataByField(29);
	return data;
  };
  epw.snowDepth = function() {
	data = this.getDataByField(30);
	return data;
  };
  epw.daysSinceLastSnowfall = function() {
	data = this.getDataByField(31);
	return data;
  };
  epw.albedo = function() {
	data = this.getDataByField(32);
	return data;
  };
  epw.albedo = function() {
	data = this.getDataByField(32);
	return data;
  };
  epw.liquidPrecipitationDepth = function() {
	data = this.getDataByField(33);
	return data;
  };
  epw.liquidPrecipitationQuantity = function() {
	data = this.getDataByField(34);
	return data;
  };

  //import location data on first line. example:
  //LOCATION,Denver Centennial  Golden   Nr,CO,USA,TMY3,724666,39.74,-105.18,-7.0,1829.0
  epw._location 		= epw_raw[0];
  epw.stationLocation 	= epw_raw[0][1];
  epw.state 			= epw_raw[0][2];
  epw.country			= epw_raw[0][3];
  epw.source			= epw_raw[0][4];
  epw.stationID 		= epw_raw[0][5];
  epw.latitude			= epw_raw[0][6];
  epw.longitude 		= epw_raw[0][7];
  epw.timeZone			= epw_raw[0][8];
  epw.elevation			= epw_raw[0][9];
  
  //More header methods can go here
  
  //DATA PERIOD
  epw.dataPeriod		= epw_raw[7];
  
  //WEATHER DATA
  //remove header and parse weather data into weatherData object
  epw_raw.splice(0,8);
  epw.weatherData = epw_raw;

  return epw;
};