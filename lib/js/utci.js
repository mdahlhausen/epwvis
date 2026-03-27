/*-------------------------------------------------------------------------
 * utci.js
 * Calculates Universal Thermal Climate Index (UTCI) from EPW weather data.
 *
 * Translated from pythermalcomfort (Python), CBE Thermal Comfort Tool,
 * UC Berkeley Center for the Built Environment.
 * https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort
 *
 * Reference:
 *   Bröde P, Fiala D, Blazejczyk K, Holmér I, Jendritzky G, Kampmann B,
 *   Tinz B, Havenith G (2012). Deriving the Operational Procedure for the
 *   Universal Thermal Climate Index (UTCI). Int J Biometeorol 56:481–494.
 *   https://doi.org/10.1007/s00484-011-0454-1
 *
 * Four UTCI variants (matching the clima tool / pythermalcomfort):
 *
 *   Sun & Wind      : MRT = DBT + solar delta_mrt   v = actual (clamped 0.6–16.9 m/s)
 *   no Sun & Wind   : MRT = DBT                      v = actual (clamped 0.6–16.9 m/s)
 *   Sun & no Wind   : MRT = DBT + solar delta_mrt   v = 0.5 m/s (calm)
 *   no Sun & no Wind: MRT = DBT                      v = 0.5 m/s (calm)
 *
 * "no Sun" sets MRT = dry-bulb temperature (no radiant load from sun or sky).
 * "Sun" adds a solar gain delta-MRT via the ASHRAE 55 ERF model.
 * "no Wind" uses 0.5 m/s (UTCI calm-condition floor).
 * "Wind" uses measured wind speed, clamped to [0.6, 16.9] m/s.
 *
 * Solar gain model parameters (matching clima defaults):
 *   sharp = 45°  sol_transmittance = 1.0  f_svv = 1.0  f_bes = 1.0
 *   asw = 0.7    posture = "standing"     floor_reflectance = 0.6
 *
 * UTCI stress categories:
 *   < -40 °C  : extreme cold stress
 *   -40–-27   : very strong cold stress
 *   -27–-13   : strong cold stress
 *   -13–0     : moderate cold stress
 *    0–9      : slight cold stress
 *    9–26     : no thermal stress
 *   26–32     : moderate heat stress
 *   32–38     : strong heat stress
 *   38–46     : very strong heat stress
 *   > 46      : extreme heat stress
 *
 * Inputs (scalar values, supplied by epw.computeUTCI in epw2json.js):
 *   tdb  – dry-bulb temperature [°C]
 *   rh   – relative humidity [%]
 *   dnr  – direct normal radiation [Wh/m²]
 *   v    – wind speed at 10 m [m/s]
 *   solAlt – solar altitude [degrees], from SolarPV.computeSolarPositions
 *            (stored in epw.solarPosition).
 *-------------------------------------------------------------------------*/


/*==========================================================================
 * 1. SOLAR GAIN (ASHRAE 55 ERF / delta-MRT model)
 *==========================================================================*/

/**
 * Find index i such that arr[i] ≤ x ≤ arr[i+1] (bilinear interpolation span).
 *
 * @param {number[]} arr - Sorted ascending breakpoints
 * @param {number}   x   - Value to locate
 * @returns {number} Lower interval index
 */
function _solarGainFindSpan(arr, x) {
  for (var i = 0; i < arr.length - 1; i++) {
    if (arr[i + 1] >= x && x >= arr[i]) return i;
  }
  return arr.length - 2;
}

/**
 * Solar gain delta mean-radiant-temperature [°C] for a standing person
 * outdoors, using the ASHRAE 55 Effective Radiant Field (ERF) model.
 *
 * Implements pythermalcomfort solar_gain() with the fixed outdoor defaults
 * used by the clima tool:
 *   sharp = 45°  sol_transmittance = 1.0  f_svv = 1.0  f_bes = 1.0
 *   asw = 0.7    posture = "standing"     floor_reflectance = 0.6
 *
 * Returns 0 for nighttime hours (solAltitudeDeg ≤ 0) or when there is no
 * direct solar radiation.  Output is capped at 70 °C (matching clima).
 *
 * @param {number} solAltitudeDeg        - Solar altitude [degrees, 0–90]
 * @param {number} directNormalRadiation - Direct normal radiation [W/m²]
 * @returns {number} delta_mrt [°C], ≥ 0, capped at 70
 */
function utciSolarGainDeltaMrt(solAltitudeDeg, directNormalRadiation) {
  if (solAltitudeDeg <= 0 || !isFinite(directNormalRadiation) || directNormalRadiation <= 0) {
    return 0;
  }

  // Fixed outdoor parameters matching clima defaults
  var sharp             = 45;    // solar horizontal angle relative to person [deg]
  var sol_transmittance = 1.0;
  var f_svv             = 1.0;   // sky-vault view fraction
  var f_bes             = 1.0;   // fraction of body surface exposed to sun
  var asw               = 0.7;   // short-wave absorptivity
  var floor_reflectance = 0.6;
  var f_eff             = 0.725; // fraction of body surface exposed to radiation (standing)
  var hr                = 6;     // linearised radiation coefficient [W m⁻² K⁻¹] (ASHRAE 55)
  var lw_abs            = 0.95;

  var deg2rad = Math.PI / 180.0;
  var sol_rad = directNormalRadiation;
  var i_diff  = 0.2 * sol_rad;
  var alt_rad = solAltitudeDeg * deg2rad;

  // Projected area factor table for standing posture
  // fp_table[az_index][alt_index]
  // az_range  [0,15,30,45,60,75,90,105,120,135,150,165,180] – 13 values, 12 intervals
  // alt_range [0,15,30,45,60,75,90]                         –  7 values,  6 intervals
  var fp_table = [
    [0.350, 0.350, 0.314, 0.258, 0.206, 0.144, 0.082],
    [0.342, 0.342, 0.310, 0.252, 0.200, 0.140, 0.082],
    [0.330, 0.330, 0.300, 0.244, 0.190, 0.132, 0.082],
    [0.310, 0.310, 0.275, 0.228, 0.175, 0.124, 0.082],
    [0.283, 0.283, 0.251, 0.208, 0.160, 0.114, 0.082],
    [0.252, 0.252, 0.228, 0.188, 0.150, 0.108, 0.082],
    [0.230, 0.230, 0.214, 0.180, 0.148, 0.108, 0.082],
    [0.242, 0.242, 0.222, 0.180, 0.153, 0.112, 0.082],
    [0.274, 0.274, 0.245, 0.203, 0.165, 0.116, 0.082],
    [0.304, 0.304, 0.270, 0.220, 0.174, 0.121, 0.082],
    [0.328, 0.328, 0.290, 0.234, 0.183, 0.125, 0.082],
    [0.344, 0.344, 0.304, 0.244, 0.190, 0.128, 0.082],
    [0.347, 0.347, 0.308, 0.246, 0.191, 0.128, 0.082]
  ];
  var alt_range = [0, 15, 30, 45, 60, 75, 90];
  var az_range  = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

  // Clamp to table bounds
  var altC = Math.min(Math.max(solAltitudeDeg, 0), 89.99);
  var azC  = Math.min(Math.max(sharp, 0), 179.99);

  var alt_i = _solarGainFindSpan(alt_range, altC);
  var az_i  = _solarGainFindSpan(az_range,  azC);

  var fp11 = fp_table[az_i    ][alt_i    ];
  var fp12 = fp_table[az_i    ][alt_i + 1];
  var fp21 = fp_table[az_i + 1][alt_i    ];
  var fp22 = fp_table[az_i + 1][alt_i + 1];
  var az1  = az_range[az_i],   az2  = az_range[az_i  + 1];
  var alt1 = alt_range[alt_i], alt2 = alt_range[alt_i + 1];

  // Bilinear interpolation
  var fp = (  fp11 * (az2 - azC)  * (alt2 - altC)
            + fp21 * (azC - az1)  * (alt2 - altC)
            + fp12 * (az2 - azC)  * (altC - alt1)
            + fp22 * (azC - az1)  * (altC - alt1)  )
           / ((az2 - az1) * (alt2 - alt1));

  var e_diff      = f_eff * f_svv * 0.5 * sol_transmittance * i_diff;
  var e_direct    = f_eff * fp   * sol_transmittance * f_bes * sol_rad;
  var e_reflected = f_eff * f_svv * 0.5 * sol_transmittance
                  * (sol_rad * Math.sin(alt_rad) + i_diff)
                  * floor_reflectance;

  var erf   = (e_diff + e_direct + e_reflected) * (asw / lw_abs);
  var d_mrt = erf / (hr * f_eff);

  return Math.min(d_mrt, 70); // cap at 70 °C, matching clima
}


/*==========================================================================
 * 3. UTCI CORE POLYNOMIAL
 *==========================================================================*/

/**
 * Saturation vapour pressure [hPa] from dry-bulb temperature [°C].
 * (UTCI reference polynomial, same as used in pythermalcomfort)
 *
 * @param {number} tdb - Dry-bulb temperature [°C]
 * @returns {number} Saturation vapour pressure [hPa]
 */
function _utciSatVapPressure(tdb) {
  var g = [
    -2836.5744,
    -6028.076559,
    19.54263612,
    -0.02737830188,
    0.000016261698,
    7.0229056e-10,
    -1.8680009e-13
  ];
  var tk = tdb + 273.15;
  var es = 2.7150305 * Math.log(1 + tk);
  for (var i = 0; i < g.length; i++) {
    es += g[i] * Math.pow(tk, i - 2);
  }
  return Math.exp(es) * 0.01; // Pa → hPa
}

/**
 * Core UTCI 6th-order polynomial approximation.
 * Translated directly from pythermalcomfort _utci_optimized().
 *
 * @param {number} tdb        - Dry-bulb temperature [°C]
 * @param {number} v          - Wind speed at 10 m [m/s]
 * @param {number} delta_t_tr - tr − tdb [°C]
 * @param {number} pa         - Partial vapour pressure [kPa]
 * @returns {number} UTCI approximation [°C]
 */
function _utciPolynomial(tdb, v, delta_t_tr, pa) {
  return (
    tdb
    + 0.607562052
    + (-0.0227712343) * tdb
    + (8.06470249e-4) * tdb * tdb
    + (-1.54271372e-4) * tdb * tdb * tdb
    + (-3.24651735e-6) * tdb * tdb * tdb * tdb
    + (7.32602852e-8) * tdb * tdb * tdb * tdb * tdb
    + (1.35959073e-9) * tdb * tdb * tdb * tdb * tdb * tdb
    + (-2.25836520) * v
    + 0.0880326035 * tdb * v
    + 0.00216844454 * tdb * tdb * v
    + (-1.53347087e-5) * tdb * tdb * tdb * v
    + (-5.72983704e-7) * tdb * tdb * tdb * tdb * v
    + (-2.55090145e-9) * tdb * tdb * tdb * tdb * tdb * v
    + (-0.751269505) * v * v
    + (-0.00408350271) * tdb * v * v
    + (-5.21670675e-5) * tdb * tdb * v * v
    + (1.94544667e-6) * tdb * tdb * tdb * v * v
    + (1.14099531e-8) * tdb * tdb * tdb * tdb * v * v
    + 0.158137256 * v * v * v
    + (-6.57263143e-5) * tdb * v * v * v
    + (2.22697524e-7) * tdb * tdb * v * v * v
    + (-4.16117031e-8) * tdb * tdb * tdb * v * v * v
    + (-0.0127762753) * v * v * v * v
    + (9.66891875e-6) * tdb * v * v * v * v
    + (2.52785852e-9) * tdb * tdb * v * v * v * v
    + (4.56306672e-4) * v * v * v * v * v
    + (-1.74202546e-7) * tdb * v * v * v * v * v
    + (-5.91491269e-6) * v * v * v * v * v * v
    + 0.398374029 * delta_t_tr
    + (1.83945314e-4) * tdb * delta_t_tr
    + (-1.73754510e-4) * tdb * tdb * delta_t_tr
    + (-7.60781159e-7) * tdb * tdb * tdb * delta_t_tr
    + (3.77830287e-8) * tdb * tdb * tdb * tdb * delta_t_tr
    + (5.43079673e-10) * tdb * tdb * tdb * tdb * tdb * delta_t_tr
    + (-0.0200518269) * v * delta_t_tr
    + (8.92859837e-4) * tdb * v * delta_t_tr
    + (3.45433048e-6) * tdb * tdb * v * delta_t_tr
    + (-3.77925774e-7) * tdb * tdb * tdb * v * delta_t_tr
    + (-1.69699377e-9) * tdb * tdb * tdb * tdb * v * delta_t_tr
    + (1.69992415e-4) * v * v * delta_t_tr
    + (-4.99204314e-5) * tdb * v * v * delta_t_tr
    + (2.47417178e-7) * tdb * tdb * v * v * delta_t_tr
    + (1.07596466e-8) * tdb * tdb * tdb * v * v * delta_t_tr
    + (8.49242932e-5) * v * v * v * delta_t_tr
    + (1.35191328e-6) * tdb * v * v * v * delta_t_tr
    + (-6.21531254e-9) * tdb * tdb * v * v * v * delta_t_tr
    + (-4.99410301e-6) * v * v * v * v * delta_t_tr
    + (-1.89489258e-8) * tdb * v * v * v * v * delta_t_tr
    + (8.15300114e-8) * v * v * v * v * v * delta_t_tr
    + (7.55043090e-4) * delta_t_tr * delta_t_tr
    + (-5.65095215e-5) * tdb * delta_t_tr * delta_t_tr
    + (-4.52166564e-7) * tdb * tdb * delta_t_tr * delta_t_tr
    + (2.46688878e-8) * tdb * tdb * tdb * delta_t_tr * delta_t_tr
    + (2.42674348e-10) * tdb * tdb * tdb * tdb * delta_t_tr * delta_t_tr
    + (1.54547250e-4) * v * delta_t_tr * delta_t_tr
    + (5.24110970e-6) * tdb * v * delta_t_tr * delta_t_tr
    + (-8.75874982e-8) * tdb * tdb * v * delta_t_tr * delta_t_tr
    + (-1.50743064e-9) * tdb * tdb * tdb * v * delta_t_tr * delta_t_tr
    + (-1.56236307e-5) * v * v * delta_t_tr * delta_t_tr
    + (-1.33895614e-7) * tdb * v * v * delta_t_tr * delta_t_tr
    + (2.49709824e-9) * tdb * tdb * v * v * delta_t_tr * delta_t_tr
    + (6.51711721e-7) * v * v * v * delta_t_tr * delta_t_tr
    + (1.94960053e-9) * tdb * v * v * v * delta_t_tr * delta_t_tr
    + (-1.00361113e-8) * v * v * v * v * delta_t_tr * delta_t_tr
    + (-1.21206673e-5) * delta_t_tr * delta_t_tr * delta_t_tr
    + (-2.18203660e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr
    + (7.51269482e-9) * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr
    + (9.79063848e-11) * tdb * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr
    + (1.25006734e-6) * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (-1.81584736e-9) * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (-3.52197671e-10) * tdb * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (-3.36514630e-8) * v * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (1.35908359e-10) * tdb * v * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (4.17032620e-10) * v * v * v * delta_t_tr * delta_t_tr * delta_t_tr
    + (-1.30369025e-9) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (4.13908461e-10) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (9.22652254e-12) * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (-5.08220384e-9) * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (-2.24730961e-11) * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (1.17139133e-10) * v * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (6.62154879e-10) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (4.03863260e-13) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (1.95087203e-12) * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + (-4.73602469e-12) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr
    + 5.12733497 * pa
    + (-0.312788561) * tdb * pa
    + (-0.0196701861) * tdb * tdb * pa
    + (9.99690870e-4) * tdb * tdb * tdb * pa
    + (9.51738512e-6) * tdb * tdb * tdb * tdb * pa
    + (-4.66426341e-7) * tdb * tdb * tdb * tdb * tdb * pa
    + 0.548050612 * v * pa
    + (-0.00330552823) * tdb * v * pa
    + (-0.00164119440) * tdb * tdb * v * pa
    + (-5.16670694e-6) * tdb * tdb * tdb * v * pa
    + (9.52692432e-7) * tdb * tdb * tdb * tdb * v * pa
    + (-0.0429223622) * v * v * pa
    + 0.00500845667 * tdb * v * v * pa
    + (1.00601257e-6) * tdb * tdb * v * v * pa
    + (-1.81748644e-6) * tdb * tdb * tdb * v * v * pa
    + (-1.25813502e-3) * v * v * v * pa
    + (-1.79330391e-4) * tdb * v * v * v * pa
    + (2.34994441e-6) * tdb * tdb * v * v * v * pa
    + (1.29735808e-4) * v * v * v * v * pa
    + (1.29064870e-6) * tdb * v * v * v * v * pa
    + (-2.28558686e-6) * v * v * v * v * v * pa
    + (-0.0369476348) * delta_t_tr * pa
    + 0.00162325322 * tdb * delta_t_tr * pa
    + (-3.14279680e-5) * tdb * tdb * delta_t_tr * pa
    + (2.59835559e-6) * tdb * tdb * tdb * delta_t_tr * pa
    + (-4.77136523e-8) * tdb * tdb * tdb * tdb * delta_t_tr * pa
    + (8.64203390e-3) * v * delta_t_tr * pa
    + (-6.87405181e-4) * tdb * v * delta_t_tr * pa
    + (-9.13863872e-6) * tdb * tdb * v * delta_t_tr * pa
    + (5.15916806e-7) * tdb * tdb * tdb * v * delta_t_tr * pa
    + (-3.59217476e-5) * v * v * delta_t_tr * pa
    + (3.28696511e-5) * tdb * v * v * delta_t_tr * pa
    + (-7.10542454e-7) * tdb * tdb * v * v * delta_t_tr * pa
    + (-1.24382300e-5) * v * v * v * delta_t_tr * pa
    + (-7.38584400e-9) * tdb * v * v * v * delta_t_tr * pa
    + (2.20609296e-7) * v * v * v * v * delta_t_tr * pa
    + (-7.32469180e-4) * delta_t_tr * delta_t_tr * pa
    + (-1.87381964e-5) * tdb * delta_t_tr * delta_t_tr * pa
    + (4.80925239e-6) * tdb * tdb * delta_t_tr * delta_t_tr * pa
    + (-8.75492040e-8) * tdb * tdb * tdb * delta_t_tr * delta_t_tr * pa
    + (2.77862930e-5) * v * delta_t_tr * delta_t_tr * pa
    + (-5.06004592e-6) * tdb * v * delta_t_tr * delta_t_tr * pa
    + (1.14325367e-7) * tdb * tdb * v * delta_t_tr * delta_t_tr * pa
    + (2.53016723e-6) * v * v * delta_t_tr * delta_t_tr * pa
    + (-1.72857035e-8) * tdb * v * v * delta_t_tr * delta_t_tr * pa
    + (-3.95079398e-8) * v * v * v * delta_t_tr * delta_t_tr * pa
    + (-3.59413173e-7) * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (7.04388046e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (-1.89309167e-8) * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (-4.79768731e-7) * v * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (7.96079978e-9) * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (1.62897058e-9) * v * v * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (3.94367674e-8) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (-1.18566247e-9) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (3.34678041e-10) * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (-1.15606447e-10) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa
    + (-2.80626406) * pa * pa
    + 0.548712484 * tdb * pa * pa
    + (-0.00399428410) * tdb * tdb * pa * pa
    + (-9.54009191e-4) * tdb * tdb * tdb * pa * pa
    + (1.93090978e-5) * tdb * tdb * tdb * tdb * pa * pa
    + (-0.308806365) * v * pa * pa
    + 0.0116952364 * tdb * v * pa * pa
    + (4.95271903e-4) * tdb * tdb * v * pa * pa
    + (-1.90710882e-5) * tdb * tdb * tdb * v * pa * pa
    + 0.00210787756 * v * v * pa * pa
    + (-6.98445738e-4) * tdb * v * v * pa * pa
    + (2.30109073e-5) * tdb * tdb * v * v * pa * pa
    + (4.17856590e-4) * v * v * v * pa * pa
    + (-1.27043871e-5) * tdb * v * v * v * pa * pa
    + (-3.04620472e-6) * v * v * v * v * pa * pa
    + 0.0514507424 * delta_t_tr * pa * pa
    + (-0.00432510997) * tdb * delta_t_tr * pa * pa
    + (8.99281156e-5) * tdb * tdb * delta_t_tr * pa * pa
    + (-7.14663943e-7) * tdb * tdb * tdb * delta_t_tr * pa * pa
    + (-2.66016305e-4) * v * delta_t_tr * pa * pa
    + (2.63789586e-4) * tdb * v * delta_t_tr * pa * pa
    + (-7.01199003e-6) * tdb * tdb * v * delta_t_tr * pa * pa
    + (-1.06823306e-4) * v * v * delta_t_tr * pa * pa
    + (3.61341136e-6) * tdb * v * v * delta_t_tr * pa * pa
    + (2.29748967e-7) * v * v * v * delta_t_tr * pa * pa
    + (3.04788893e-4) * delta_t_tr * delta_t_tr * pa * pa
    + (-6.42070836e-5) * tdb * delta_t_tr * delta_t_tr * pa * pa
    + (1.16257971e-6) * tdb * tdb * delta_t_tr * delta_t_tr * pa * pa
    + (7.68023384e-6) * v * delta_t_tr * delta_t_tr * pa * pa
    + (-5.47446896e-7) * tdb * v * delta_t_tr * delta_t_tr * pa * pa
    + (-3.59937910e-8) * v * v * delta_t_tr * delta_t_tr * pa * pa
    + (-4.36497725e-6) * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa
    + (1.68737969e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa
    + (2.67489271e-8) * v * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa
    + (3.23926897e-9) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa
    + (-0.0353874123) * pa * pa * pa
    + (-0.221201190) * tdb * pa * pa * pa
    + 0.0155126038 * tdb * tdb * pa * pa * pa
    + (-2.63917279e-4) * tdb * tdb * tdb * pa * pa * pa
    + 0.0453433455 * v * pa * pa * pa
    + (-0.00432943862) * tdb * v * pa * pa * pa
    + (1.45389826e-4) * tdb * tdb * v * pa * pa * pa
    + (2.17508610e-4) * v * v * pa * pa * pa
    + (-6.66724702e-5) * tdb * v * v * pa * pa * pa
    + (3.33217140e-5) * v * v * v * pa * pa * pa
    + (-0.00226921615) * delta_t_tr * pa * pa * pa
    + (3.80261982e-4) * tdb * delta_t_tr * pa * pa * pa
    + (-5.45314314e-9) * tdb * tdb * delta_t_tr * pa * pa * pa
    + (-7.96355448e-4) * v * delta_t_tr * pa * pa * pa
    + (2.53458034e-5) * tdb * v * delta_t_tr * pa * pa * pa
    + (-6.31223658e-6) * v * v * delta_t_tr * pa * pa * pa
    + (3.02122035e-4) * delta_t_tr * delta_t_tr * pa * pa * pa
    + (-4.77403547e-6) * tdb * delta_t_tr * delta_t_tr * pa * pa * pa
    + (1.73825715e-6) * v * delta_t_tr * delta_t_tr * pa * pa * pa
    + (-4.09087898e-7) * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa * pa
    + 0.614155345 * pa * pa * pa * pa
    + (-0.0616755931) * tdb * pa * pa * pa * pa
    + 0.00133374846 * tdb * tdb * pa * pa * pa * pa
    + 0.00355375387 * v * pa * pa * pa * pa
    + (-5.13027851e-4) * tdb * v * pa * pa * pa * pa
    + (1.02449757e-4) * v * v * pa * pa * pa * pa
    + (-0.00148526421) * delta_t_tr * pa * pa * pa * pa
    + (-4.11469183e-5) * tdb * delta_t_tr * pa * pa * pa * pa
    + (-6.80434415e-6) * v * delta_t_tr * pa * pa * pa * pa
    + (-9.77675906e-6) * delta_t_tr * delta_t_tr * pa * pa * pa * pa
    + 0.0882773108 * pa * pa * pa * pa * pa
    + (-0.00301859306) * tdb * pa * pa * pa * pa * pa
    + 0.00104452989 * v * pa * pa * pa * pa * pa
    + (2.47090539e-4) * delta_t_tr * pa * pa * pa * pa * pa
    + 0.00148348065 * pa * pa * pa * pa * pa * pa
  );
}

/**
 * Return the UTCI stress category string for a given UTCI temperature.
 *
 * @param {number} utciTemp - UTCI temperature [°C]
 * @returns {string} Stress category label
 */
function utciStressCategory(utciTemp) {
  if (utciTemp < -40) return "extreme cold stress";
  if (utciTemp < -27) return "very strong cold stress";
  if (utciTemp < -13) return "strong cold stress";
  if (utciTemp <   0) return "moderate cold stress";
  if (utciTemp <   9) return "slight cold stress";
  if (utciTemp <  26) return "no thermal stress";
  if (utciTemp <  32) return "moderate heat stress";
  if (utciTemp <  38) return "strong heat stress";
  if (utciTemp <  46) return "very strong heat stress";
  return "extreme heat stress";
}

/*==========================================================================
 * 4. PUBLIC UTCI API
 *==========================================================================*/

/**
 * Calculate UTCI for a single set of conditions.
 *
 * The caller is responsible for passing the correct tr and v for each
 * variant (Sun/noSun, Wind/noWind).  Input validation uses inclusive
 * bounds matching pythermalcomfort valid_range():
 *   -50 ≤ tdb ≤ 50 °C
 *   -30 ≤ (tr − tdb) ≤ 70 °C
 *    0.5 ≤ v ≤ 17 m/s
 *
 * @param {number}  tdb          - Dry-bulb temperature [°C]
 * @param {number}  tr           - Mean radiant temperature [°C]
 * @param {number}  v            - Wind speed at 10 m [m/s] (pre-clamped by caller)
 * @param {number}  rh           - Relative humidity [%]
 * @param {boolean} [limitInputs=true] Returns null when outside valid ranges.
 * @returns {{utci: number, stressCategory: string}|null}
 */
function utci(tdb, tr, v, rh, limitInputs) {
  limitInputs = (limitInputs === undefined) ? true : limitInputs;

  if (!isFinite(tdb) || !isFinite(tr) || !isFinite(v) || !isFinite(rh)) {
    return null;
  }

  var delta_t_tr = tr - tdb;
  var eh_pa      = _utciSatVapPressure(tdb) * (rh / 100.0);
  var pa         = eh_pa / 10.0; // hPa → kPa

  if (limitInputs) {
    if (tdb < -50 || tdb > 50)               return null;
    if (delta_t_tr < -30 || delta_t_tr > 70) return null;
    if (v < 0.5 || v > 17)                   return null;
  }

  var utciVal = Math.round(_utciPolynomial(tdb, v, delta_t_tr, pa) * 10) / 10;

  return {
    utci:           utciVal,
    stressCategory: utciStressCategory(utciVal)
  };
}
