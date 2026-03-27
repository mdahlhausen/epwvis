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

  epw.getPsychrometricField = function(fieldName) {
	if (!this.psychrometrics || !this.psychrometrics[fieldName]) {
	  this.computePsychrometrics();
	}
	if (!this.psychrometrics || !this.psychrometrics[fieldName]) {
	  return [];
	}
	return this.psychrometrics[fieldName].slice(0);
  };

  epw.computePsychrometrics = function() {
	var properties = {
	  wetBulbTemperature: [],
	  humidityRatio: [],
	  specificHumidity: [],
	  vaporPressure: [],
	  moistAirEnthalpy: [],
	  moistAirVolume: [],
	  degreeOfSaturation: [],
	  moistAirDensity: []
	};

	if (typeof psychrolib === "undefined" || !psychrolib || typeof psychrolib.SetUnitSystem !== "function") {
	  this.psychrometrics = properties;
	  return properties;
	}

	psychrolib.SetUnitSystem(psychrolib.SI);

	var minDryBulbTemperatureC = -100;
	var maxDryBulbTemperatureC = 70;
	var minRelativeHumidityPercent = 0;
	var maxRelativeHumidityPercent = 100;
	var minPressurePa = 10000;
	var maxPressurePa = 120000;

	this.weatherData.forEach(function(row) {
	  var dryBulbTemperature = +row[6];
	  var relativeHumidity = +row[8];
	  var pressure = +row[9];

	  var invalid = !isFinite(dryBulbTemperature) || !isFinite(relativeHumidity) || !isFinite(pressure)
		|| dryBulbTemperature > maxDryBulbTemperatureC || dryBulbTemperature < minDryBulbTemperatureC
		|| relativeHumidity < minRelativeHumidityPercent || relativeHumidity > maxRelativeHumidityPercent
		|| pressure < minPressurePa || pressure > maxPressurePa;

	  if (invalid) {
		properties.wetBulbTemperature.push(null);
		properties.humidityRatio.push(null);
		properties.specificHumidity.push(null);
		properties.vaporPressure.push(null);
		properties.moistAirEnthalpy.push(null);
		properties.moistAirVolume.push(null);
		properties.degreeOfSaturation.push(null);
		properties.moistAirDensity.push(null);
		return;
	  }

	  try {
		var relHum = relativeHumidity / 100;
		var psychrometrics = psychrolib.CalcPsychrometricsFromRelHum(dryBulbTemperature, relHum, pressure);
		var humidityRatio = psychrometrics[0];

		properties.wetBulbTemperature.push(psychrometrics[1]);
		properties.humidityRatio.push(humidityRatio);
		properties.specificHumidity.push(psychrolib.GetSpecificHumFromHumRatio(humidityRatio));
		properties.vaporPressure.push(psychrometrics[3]);
		properties.moistAirEnthalpy.push(psychrometrics[4]);
		properties.moistAirVolume.push(psychrometrics[5]);
		properties.degreeOfSaturation.push(psychrometrics[6]);
		properties.moistAirDensity.push(psychrolib.GetMoistAirDensity(dryBulbTemperature, humidityRatio, pressure));
	  } catch (err) {
		properties.wetBulbTemperature.push(null);
		properties.humidityRatio.push(null);
		properties.specificHumidity.push(null);
		properties.vaporPressure.push(null);
		properties.moistAirEnthalpy.push(null);
		properties.moistAirVolume.push(null);
		properties.degreeOfSaturation.push(null);
		properties.moistAirDensity.push(null);
	  }
	});

	this.psychrometrics = properties;
	return properties;
  };

  // --- Solar position derived via SolarPV.computeSolarPositions (altitude/azimuth, computed from location + time) ---

  epw.getSolarPositionField = function(fieldName) {
	if (!this.solarPosition || !this.solarPosition[fieldName]) {
	  this.computeSolarPosition();
	}
	if (!this.solarPosition || !this.solarPosition[fieldName]) {
	  return [];
	}
	return this.solarPosition[fieldName].slice(0);
  };

  epw.computeSolarPosition = function() {
	var empty = { altitude: [], azimuth: [] };
	if (typeof window === 'undefined' || !window.SolarPV || typeof window.SolarPV.computeSolarPositions !== 'function') {
	  this.solarPosition = empty;
	  return empty;
	}
	var result = window.SolarPV.computeSolarPositions(this);
	this.solarPosition = result || empty;
	return this.solarPosition;
  };

  // Solar Altitude | degrees above horizon (+ = above, - = below) | computed from location and time
  epw.solarAltitude = function() {
	return this.getSolarPositionField('altitude');
  };

  // Solar Azimuth | degrees clockwise from North (0=N, 90=E, 180=S, 270=W) | computed from location and time
  epw.solarAzimuth = function() {
	return this.getSolarPositionField('azimuth');
  };

  // --- UTCI: Universal Thermal Climate Index ---
  // Solar delta-MRT uses the ASHRAE 55 ERF model (pythermalcomfort solar_gain).
  // Solar altitude is read from the pre-computed solarPosition data object.
  // EPW fields used: 6=tdb, 8=rh, 14=dirNormRad, 21=windSpeed.
  //
  // Options (object, all optional):
  //   includeSun  {boolean} default true  – add solar radiant gain to MRT
  //   includeWind {boolean} default true  – use measured wind speed; false = calm (0.5 m/s)

  epw.computeUTCI = function(options) {
	var opts       = options || {};
	var includeSun  = (opts.includeSun  === undefined) ? true : !!opts.includeSun;
	var includeWind = (opts.includeWind === undefined) ? true : !!opts.includeWind;

	var result = { utci: [], stressCategory: [] };

	if (typeof utci !== "function") {
	  return result;
	}

	var altitudes = this.getSolarPositionField('altitude');

	this.weatherData.forEach(function(row, i) {
	  var tdb   = +row[6];  // dry-bulb temperature [°C]
	  var rh    = +row[8];  // relative humidity [%]
	  var dnr   = +row[14]; // direct normal radiation [Wh/m²]
	  var v     = +row[21]; // wind speed [m/s]

	  var invalid = !isFinite(tdb) || tdb === 99.9
	             || !isFinite(rh)  || rh  === 999
	             || !isFinite(v)   || v   === 999;

	  if (invalid) {
		result.utci.push(null);
		result.stressCategory.push(null);
		return;
	  }

	  // Wind speed: actual (clamped to [0.6, 16.9] m/s) or calm (0.5 m/s)
	  var v_eff = includeWind ? Math.min(Math.max(v, 0.6), 16.9) : 0.5;

	  // MRT: DBT + solar gain, or DBT only
	  var mrt = tdb;
	  if (includeSun) {
		var dnrVal  = (!isFinite(dnr) || dnr === 9999) ? 0 : dnr;
		var solAlt  = (altitudes.length > i && isFinite(altitudes[i])) ? altitudes[i] : 0;
		mrt = tdb + utciSolarGainDeltaMrt(solAlt, dnrVal);
	  }

	  var r = utci(tdb, mrt, v_eff, rh, true);
	  if (r === null) {
		result.utci.push(null);
		result.stressCategory.push(null);
	  } else {
		result.utci.push(r.utci);
		result.stressCategory.push(r.stressCategory);
	  }
	});

	return result;
  };

  epw.utci = function(options) {
	return this.computeUTCI(options).utci;
  };

  // Returns: array of stress category strings (null for invalid/missing hours)
  // Accepts the same options as epw.utci().
  epw.utciStressCategory = function(options) {
	return this.computeUTCI(options).stressCategory;
  };

  // Data fields in weather data (EPW IDD field numbers, 0-indexed after header rows are stripped)

  // Field 0 | Year
  epw.year = function() {
	data = this.getDataByField(0);
	return data;
  };
  // Field 1 | Month | 1–12
  epw.month = function() {
	data = this.getDataByField(1);
	return data;
  };
  // Field 2 | Day of month | 1–31
  epw.day = function() {
	data = this.getDataByField(2);
	return data;
  };
  // Field 3 | Hour | 1–24 (1 = first hour of the day, i.e. 00:01–01:00)
  epw.hour = function() {
	data = this.getDataByField(3);
	return data;
  };
  // Field 4 | Minute | 0, 15, 30, or 45
  epw.minute = function() {
	data = this.getDataByField(4);
	return data;
  };
  // Field 5 | Data Source and Uncertainty Flags | string code (see EPW IDD)
  epw.uncertainty = function() {
	data = this.getDataByField(5);
	return data;
  };
  // Field 6 | Dry Bulb Temperature | °C | range: -70 to 70 | missing: 99.9
  epw.dryBulbTemperature = function() {
	data = this.getDataByField(6);
	return data;
  };
  // Field 7 | Dew Point Temperature | °C | range: -70 to 70 | missing: 99.9
  epw.dewPointTemperature = function() {
	data = this.getDataByField(7);
	return data;
  };
  // Field 8 | Relative Humidity | % | range: 0–110 | missing: 999
  epw.relativeHumidity = function() {
	data = this.getDataByField(8);
	return data;
  };
  // --- Psychrometric properties derived via PsychroLib (SI units, computed from fields 6, 8, 9) ---

  // Wet Bulb Temperature | °C | computed from dry-bulb, RH, and pressure
  epw.wetBulbTemperature = function() {
	data = this.getPsychrometricField("wetBulbTemperature");
	return data;
  };
  // Humidity Ratio (mixing ratio) | kg water / kg dry air | computed
  epw.humidityRatio = function() {
	data = this.getPsychrometricField("humidityRatio");
	return data;
  };
  // Specific Humidity | kg water / kg moist air | computed
  epw.specificHumidity = function() {
	data = this.getPsychrometricField("specificHumidity");
	return data;
  };
  // Partial Pressure of Water Vapor | Pa | computed
  epw.vaporPressure = function() {
	data = this.getPsychrometricField("vaporPressure");
	return data;
  };
  // Moist Air Enthalpy | J / kg dry air | computed
  epw.moistAirEnthalpy = function() {
	data = this.getPsychrometricField("moistAirEnthalpy");
	return data;
  };
  // Moist Air Specific Volume | m³ / kg dry air | computed
  epw.moistAirVolume = function() {
	data = this.getPsychrometricField("moistAirVolume");
	return data;
  };
  // Degree of Saturation | dimensionless ratio (0–1) | computed
  epw.degreeOfSaturation = function() {
	data = this.getPsychrometricField("degreeOfSaturation");
	return data;
  };
  // Moist Air Density | kg / m³ | computed
  epw.moistAirDensity = function() {
	data = this.getPsychrometricField("moistAirDensity");
	return data;
  };

  // --- Remaining EPW IDD fields ---

  // Field 9 | Atmospheric Station Pressure | Pa | range: 31000–120000 | missing: 999999
  epw.atmosphericStationPressure = function() {
	data = this.getDataByField(9);
	return data;
  };
  // Field 10 | Extraterrestrial Horizontal Radiation | Wh/m² | range: 0–9999 | missing: 9999
  epw.extraterrestrialHorizontalRadiation = function() {
	data = this.getDataByField(10);
	return data;
  };
  // Field 11 | Extraterrestrial Direct Normal Radiation | Wh/m² | range: 0–9999 | missing: 9999
  epw.extraterrestrialDirectNormalRadiation = function() {
	data = this.getDataByField(11);
	return data;
  };
  // Field 12 | Horizontal Infrared Radiation Intensity (sky) | Wh/m² | range: 0–9999 | missing: 9999
  epw.horizontalInfraredRadiationIntensity = function() {
	data = this.getDataByField(12);
	return data;
  };
  // Field 13 | Global Horizontal Radiation | Wh/m² | range: 0–9999 | missing: 9999
  epw.globalHorizontalRadiation = function() {
	data = this.getDataByField(13);
	return data;
  };
  // Field 14 | Direct Normal Radiation | Wh/m² | range: 0–9999 | missing: 9999
  epw.directNormalRadiation = function() {
	data = this.getDataByField(14);
	return data;
  };
  // Field 15 | Diffuse Horizontal Radiation | Wh/m² | range: 0–9999 | missing: 9999
  epw.diffuseHorizontalRadiation = function() {
	data = this.getDataByField(15);
	return data;
  };
  // Field 16 | Global Horizontal Illuminance | lux | range: 0–999999 | missing: 999999
  epw.globalHorizontalIlluminance = function() {
	data = this.getDataByField(16);
	return data;
  };
  // Field 17 | Direct Normal Illuminance | lux | range: 0–999999 | missing: 999999
  epw.directNormalIlluminance = function() {
	data = this.getDataByField(17);
	return data;
  };
  // Field 18 | Diffuse Horizontal Illuminance | lux | range: 0–999999 | missing: 999999
  epw.diffuseHorizontalIlluminance = function() {
	data = this.getDataByField(18);
	return data;
  };
  // Field 19 | Zenith Luminance | cd/m² | range: 0–9999 | missing: 9999
  epw.zenithLuminance = function() {
	data = this.getDataByField(19);
	return data;
  };
  // Field 20 | Wind Direction | degrees (0=N, 90=E, 180=S, 270=W, 0=calm) | range: 0–360 | missing: 999
  epw.windDirection = function() {
	data = this.getDataByField(20);
	return data;
  };
  // Field 21 | Wind Speed | m/s | range: 0–40 | missing: 999
  epw.windSpeed = function() {
	data = this.getDataByField(21);
	return data;
  };
  // Field 22 | Total Sky Cover | tenths (0=clear, 10=overcast) | range: 0–10 | missing: 99
  epw.totalSkyCover = function() {
	data = this.getDataByField(22);
	return data;
  };
  // Field 23 | Opaque Sky Cover | tenths (0=clear, 10=overcast) | range: 0–10 | missing: 99
  epw.opaqueSkyCover = function() {
	data = this.getDataByField(23);
	return data;
  };
  // Field 24 | Visibility | km | range: 0–9999 | missing: 9999
  epw.visibility = function() {
	data = this.getDataByField(24);
	return data;
  };
  // Field 25 | Ceiling Height | m | range: 0–9999 | missing: 99999
  epw.ceilingHeight = function() {
	data = this.getDataByField(25);
	return data;
  };
  // Field 26 | Present Weather Observation | 0=station obs, 9=missing | missing: 9
  epw.presentWeatherObservation = function() {
	data = this.getDataByField(26);
	return data;
  };
  // Field 27 | Present Weather Codes | 9-digit code (see EPW IDD Appendix B) | missing: 999999999
  epw.presentWeatherCodes = function() {
	data = this.getDataByField(27);
	return data;
  };
  // Field 28 | Precipitable Water | mm | range: 0–999 | missing: 999
  epw.precipitableWater = function() {
	data = this.getDataByField(28);
	return data;
  };
  // Field 29 | Aerosol Optical Depth | dimensionless (broadband turbidity) | range: 0–0.999 | missing: 0.999
  epw.aerosolOpticalDepth = function() {
	data = this.getDataByField(29);
	return data;
  };
  // Field 30 | Snow Depth | cm | range: 0–150 | missing: 999
  epw.snowDepth = function() {
	data = this.getDataByField(30);
	return data;
  };
  // Field 31 | Days Since Last Snowfall | days | range: 0–88 | missing: 99
  epw.daysSinceLastSnowfall = function() {
	data = this.getDataByField(31);
	return data;
  };
  // Field 32 | Albedo | dimensionless ratio (reflected / incident solar) | range: 0.1–1.0 | missing: 999
  epw.albedo = function() {
	data = this.getDataByField(32);
	return data;
  };
  // Field 33 | Liquid Precipitation Depth | mm | range: 0–999 | missing: 999
  epw.liquidPrecipitationDepth = function() {
	data = this.getDataByField(33);
	return data;
  };
  // Field 34 | Liquid Precipitation Quantity (collection interval) | hr | range: 0–24 | missing: 99
  epw.liquidPrecipitationQuantity = function() {
	data = this.getDataByField(34);
	return data;
  };

  // Import location data from header row 0. Example:
  // LOCATION,Denver Centennial  Golden   Nr,CO,USA,TMY3,724666,39.74,-105.18,-7.0,1829.0
  epw._location 		= epw_raw[0];
  epw.stationLocation 	= epw_raw[0][1]; // Station name | string
  epw.state 			= epw_raw[0][2]; // State/province code | string
  epw.country			= epw_raw[0][3]; // Country code | string
  epw.source			= epw_raw[0][4]; // Data source (e.g. TMY3, IWEC) | string
  epw.stationID 		= epw_raw[0][5]; // WMO station number | string
  epw.latitude			= epw_raw[0][6]; // Latitude | decimal degrees (+N, -S)
  epw.longitude 		= epw_raw[0][7]; // Longitude | decimal degrees (+E, -W)
  epw.timeZone			= epw_raw[0][8]; // Time zone offset from UTC | hours (+E, -W)
  epw.elevation			= epw_raw[0][9]; // Site elevation above sea level | m

  //More header methods can go here

  // Compute Köppen–Geiger climate classification from EPW weather data.
  // Returns an object: { code, name, description } or null on failure.
  epw.koppenClassification = function() {
    var temps   = this.getDataByField(6);   // Dry Bulb Temperature, °C (missing = 99.9)
    var months  = this.getDataByField(1);   // Month, 1–12
    var precips = this.getDataByField(33);  // Liquid Precipitation Depth, mm (missing = 999)

    // Accumulate monthly totals
    var monthlyTempSum   = new Array(13).fill(0);
    var monthlyTempCount = new Array(13).fill(0);
    var monthlyPrecip    = new Array(13).fill(0);
    var monthlyPrecipCount = new Array(13).fill(0);

    for (var i = 0; i < temps.length; i++) {
      var m = +months[i];
      if (m < 1 || m > 12) continue;

      var t = +temps[i];
      if (isFinite(t) && t < 90) {       // 99.9 = missing
        monthlyTempSum[m]   += t;
        monthlyTempCount[m] += 1;
      }

      var p = +precips[i];
      if (isFinite(p) && p >= 0 && p < 999) {  // 999 = missing
        monthlyPrecip[m]      += p;
        monthlyPrecipCount[m] += 1;
      }
    }

    // Monthly average temperatures
    var monthlyTemp = new Array(13).fill(0);
    for (var m = 1; m <= 12; m++) {
      if (monthlyTempCount[m] > 0) {
        monthlyTemp[m] = monthlyTempSum[m] / monthlyTempCount[m];
      }
    }

    // Annual mean temperature, warmest/coldest month
    var Tann = 0;
    for (var m = 1; m <= 12; m++) Tann += monthlyTemp[m];
    Tann /= 12;
    var tempArr = monthlyTemp.slice(1, 13);
    var Tmax = Math.max.apply(null, tempArr);
    var Tmin = Math.min.apply(null, tempArr);
    var monthsAbove10 = tempArr.filter(function(t) { return t > 10; }).length;

    // Group E: Polar — only needs temperature
    if (Tmax < 10) {
      if (Tmax < 0) {
        return { code: 'EF', name: 'Ice cap climate',
          description: 'Polar ice cap — all 12 months average below 0 \u00b0C. Perpetual frost and ice.' };
      }
      return { code: 'ET', name: 'Tundra climate',
        description: 'Polar tundra — warmest month averages between 0 \u00b0C and 10 \u00b0C. Brief, cool growing season.' };
    }

    // Check whether precipitation data is usable (at least one valid value per month)
    var validPrecipMonths = 0;
    for (var m = 1; m <= 12; m++) {
      if (monthlyPrecipCount[m] > 0) validPrecipMonths++;
    }
    if (validPrecipMonths < 12) {
      return { code: '?', name: 'Classification requires precipitation data',
        description: 'K\u00f6ppen classification cannot be determined: precipitation data (EPW field 33) is missing for one or more months in this file.' };
    }

    // Annual and seasonal precipitation
    var Pann = 0;
    for (var m = 1; m <= 12; m++) Pann += monthlyPrecip[m];

    var lat  = parseFloat(this.latitude) || 0;
    var isSH = lat < 0;  // Southern Hemisphere
    var summerMonths = isSH ? [10,11,12,1,2,3] : [4,5,6,7,8,9];
    var winterMonths = isSH ? [4,5,6,7,8,9]   : [10,11,12,1,2,3];

    var Psummer = 0, Pwinter = 0;
    for (var i = 0; i < summerMonths.length; i++) Psummer += monthlyPrecip[summerMonths[i]];
    for (var i = 0; i < winterMonths.length; i++) Pwinter += monthlyPrecip[winterMonths[i]];

    // Group B precipitation threshold
    var summerFrac = Pann > 0 ? Psummer / Pann : 0;
    var Pthresh;
    if      (summerFrac >= 0.7) { Pthresh = 20 * Tann + 280; }
    else if (summerFrac >= 0.3) { Pthresh = 20 * Tann + 140; }
    else                        { Pthresh = 20 * Tann;        }

    // Group B: Arid / Semi-arid (checked before A, C, D)
    if (Pann < Pthresh) {
      var bSub  = Pann < 0.5 * Pthresh ? 'W' : 'S';
      var bTemp = Tann >= 18 ? 'h' : 'k';
      var code  = 'B' + bSub + bTemp;
      var bNames = {
        'BWh': 'Hot desert climate',           'BWk': 'Cold desert climate',
        'BSh': 'Hot semi-arid (steppe) climate','BSk': 'Cold semi-arid (steppe) climate'
      };
      var bDescs = {
        'BWh': 'Hot arid desert \u2014 very low annual precipitation relative to evapotranspiration; mean annual temperature above 18 \u00b0C.',
        'BWk': 'Cold arid desert \u2014 very low annual precipitation relative to evapotranspiration; mean annual temperature below 18 \u00b0C.',
        'BSh': 'Hot semi-arid steppe \u2014 annual precipitation below evapotranspiration threshold; mean annual temperature above 18 \u00b0C.',
        'BSk': 'Cold semi-arid steppe \u2014 annual precipitation below evapotranspiration threshold; mean annual temperature below 18 \u00b0C.'
      };
      return { code: code, name: bNames[code], description: bDescs[code] };
    }

    // Seasonal precipitation sub-typing for C and D
    var summerPrecips = summerMonths.map(function(m) { return monthlyPrecip[m]; });
    var winterPrecips = winterMonths.map(function(m) { return monthlyPrecip[m]; });
    var Pdry_summer = Math.min.apply(null, summerPrecips);
    var Pwet_winter = Math.max.apply(null, winterPrecips);
    var Pdry_winter = Math.min.apply(null, winterPrecips);
    var Pwet_summer = Math.max.apply(null, summerPrecips);

    // Dry summer (s): wettest winter month \u2265 3\u00d7 driest summer month AND driest summer < 40 mm
    var isDrySummer = (Pwet_winter >= 3 * Pdry_summer) && (Pdry_summer < 40);
    // Dry winter (w): wettest summer month \u2265 10\u00d7 driest winter month
    var isDryWinter = (Pwet_summer >= 10 * Pdry_winter);
    // Resolve conflict: wet-summer season wins if Psummer > Pwinter
    if (isDrySummer && isDryWinter) {
      if (Psummer > Pwinter) { isDrySummer = false; }
      else                   { isDryWinter = false; }
    }
    var precSub = isDrySummer ? 's' : (isDryWinter ? 'w' : 'f');

    // Group A: Tropical — every month \u2265 18 \u00b0C
    if (Tmin >= 18) {
      var allPrecips = monthlyPrecip.slice(1, 13);
      var Pmin = Math.min.apply(null, allPrecips);
      if (Pmin >= 60) {
        return { code: 'Af', name: 'Tropical rainforest climate',
          description: 'Tropical rainforest \u2014 all months above 18 \u00b0C, every month \u2265 60 mm precipitation. No dry season; near the equator.' };
      }
      if (Pmin >= 100 - Pann / 25) {
        return { code: 'Am', name: 'Tropical monsoon climate',
          description: 'Tropical monsoon \u2014 all months above 18 \u00b0C; short dry season offset by heavy monsoon rains.' };
      }
      // Aw vs As: dry season in winter vs summer
      var dryMonth = allPrecips.indexOf(Pmin) + 1;  // 1-indexed
      if (summerMonths.indexOf(dryMonth) !== -1) {
        return { code: 'As', name: 'Tropical savanna climate (dry summer)',
          description: 'Tropical savanna \u2014 all months above 18 \u00b0C; dry season occurs during the high-sun summer months.' };
      }
      return { code: 'Aw', name: 'Tropical savanna climate (dry winter)',
        description: 'Tropical savanna \u2014 all months above 18 \u00b0C; pronounced dry season during the cooler winter months. Open grasslands and woodlands.' };
    }

    // Temperature sub-type for C / D
    var tempSub;
    if      (Tmax >= 22)         { tempSub = 'a'; }  // hottest month \u2265 22 \u00b0C
    else if (monthsAbove10 >= 4) { tempSub = 'b'; }  // \u22654 months > 10 \u00b0C
    else if (Tmin < -38)         { tempSub = 'd'; }  // D only: coldest month < \u221238 \u00b0C
    else                         { tempSub = 'c'; }  // 1\u20133 months > 10 \u00b0C

    // Group C: Temperate — coldest month > 0 \u00b0C (and < 18 \u00b0C)
    if (Tmin > 0) {
      var code = 'C' + precSub + tempSub;
      var cNames = {
        'Cfa':'Humid subtropical climate',              'Cfb':'Temperate oceanic climate',
        'Cfc':'Subpolar oceanic climate',               'Csa':'Hot-summer Mediterranean climate',
        'Csb':'Warm-summer Mediterranean climate',      'Csc':'Cold-summer Mediterranean climate',
        'Cwa':'Monsoon-influenced humid subtropical climate', 'Cwb':'Subtropical highland climate',
        'Cwc':'Monsoon-influenced subpolar oceanic climate'
      };
      var cDescs = {
        'Cfa':'Humid subtropical \u2014 hot summers (warmest month \u226522 \u00b0C), mild winters above freezing, year-round rainfall. SE USA, E China, SE South America.',
        'Cfb':'Temperate oceanic \u2014 warm summers (warmest month <22 \u00b0C), mild winters, year-round rainfall. W Europe, Pacific NW, SE Australia.',
        'Cfc':'Subpolar oceanic \u2014 cool summers (1\u20133 months above 10 \u00b0C), mild winters, no dry season. High-latitude coastal regions.',
        'Csa':'Hot-summer Mediterranean \u2014 dry hot summers (warmest month \u226522 \u00b0C), mild wet winters. Mediterranean basin, California, SW Australia.',
        'Csb':'Warm-summer Mediterranean \u2014 dry warm summers (warmest month <22 \u00b0C), mild wet winters. Coastal California, NW Iberia, SW South Africa.',
        'Csc':'Cold-summer Mediterranean \u2014 dry cool summers (1\u20133 months above 10 \u00b0C), mild winters. Rare; high elevations near oceanic coasts.',
        'Cwa':'Monsoon-influenced humid subtropical \u2014 dry winters, wet summers, warmest month \u226522 \u00b0C. Indo-Gangetic Plain, SE Africa, E Asia.',
        'Cwb':'Subtropical highland \u2014 dry winters, wet summers, warmest month <22 \u00b0C. Tropical and subtropical highlands of Africa, Central/South America.',
        'Cwc':'Monsoon-influenced subpolar oceanic \u2014 dry winters, cool wet summers (1\u20133 months above 10 \u00b0C). Rare high-altitude variant.'
      };
      return { code: code, name: cNames[code] || code, description: cDescs[code] || code };
    }

    // Group D: Continental — coldest month \u22640 \u00b0C, at least one month > 10 \u00b0C
    var code = 'D' + precSub + tempSub;
    var dNames = {
      'Dfa':'Hot-summer humid continental climate',     'Dfb':'Warm-summer humid continental climate',
      'Dfc':'Subarctic climate',                         'Dfd':'Extremely cold subarctic climate',
      'Dsa':'Mediterranean-influenced hot-summer continental climate',
      'Dsb':'Mediterranean-influenced warm-summer continental climate',
      'Dsc':'Mediterranean-influenced subarctic climate','Dsd':'Mediterranean-influenced extremely cold subarctic climate',
      'Dwa':'Monsoon-influenced hot-summer continental climate',
      'Dwb':'Monsoon-influenced warm-summer continental climate',
      'Dwc':'Monsoon-influenced subarctic climate',     'Dwd':'Monsoon-influenced extremely cold subarctic climate'
    };
    var dDescs = {
      'Dfa':'Hot-summer humid continental \u2014 cold winters below freezing, hot summers (warmest month \u226522 \u00b0C), year-round precipitation. US Midwest, central Europe.',
      'Dfb':'Warm-summer humid continental \u2014 cold winters, warm summers (warmest month <22 \u00b0C), year-round precipitation. NE USA, N Europe, N China.',
      'Dfc':'Subarctic (boreal) \u2014 very cold winters, cool short summers (1\u20133 months above 10 \u00b0C). Characteristic taiga biome.',
      'Dfd':'Extremely cold subarctic \u2014 severe winters (coldest month < \u221238 \u00b0C), cool short summers. NE Siberia only.',
      'Dsa':'Mediterranean-influenced hot-summer continental \u2014 cold winters, hot dry summers (warmest month \u226522 \u00b0C). High elevations near Mediterranean coasts.',
      'Dsb':'Mediterranean-influenced warm-summer continental \u2014 cold winters, warm dry summers (warmest month <22 \u00b0C).',
      'Dsc':'Mediterranean-influenced subarctic \u2014 cold winters, cool dry summers (1\u20133 months above 10 \u00b0C).',
      'Dsd':'Mediterranean-influenced extremely cold subarctic \u2014 severe winters, dry summers.',
      'Dwa':'Monsoon-influenced hot-summer continental \u2014 cold dry winters, hot wet summers (warmest month \u226522 \u00b0C). NE China, Korea, N Japan.',
      'Dwb':'Monsoon-influenced warm-summer continental \u2014 cold dry winters, warm wet summers (warmest month <22 \u00b0C).',
      'Dwc':'Monsoon-influenced subarctic \u2014 cold dry winters, cool short summers (1\u20133 months above 10 \u00b0C). E Siberia, N China.',
      'Dwd':'Monsoon-influenced extremely cold subarctic \u2014 severe dry winters. NE Siberia.'
    };
    return { code: code, name: dNames[code] || code, description: dDescs[code] || code };
  };

  //DATA PERIOD
  epw.dataPeriod		= epw_raw[7];

  //WEATHER DATA
  //remove header and parse weather data into weatherData object
  epw_raw.splice(0,8);
  epw.weatherData = epw_raw;
  epw.computePsychrometrics();
  epw.computeSolarPosition();

  return epw;
};