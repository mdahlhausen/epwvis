# [epwvis](http://mdahlhausen.github.io/epwvis)
------
*An online viewer and analysis tool for EnergyPlus Weather (EPW) files.*

EPW files can be downloaded from [epwmap](https://www.ladybug.tools/epwmap/), [One Building](https://climate.onebuilding.org), or the [EnergyPlus weather](https://energyplus.net/weather) website.

When an EPW file is parsed, epwvis now computes additional psychrometric properties (wet-bulb temperature, humidity ratio, specific humidity, vapor pressure, moist-air enthalpy/volume/density, and degree of saturation) using [PsychroLib](github.com/psychrometrics/psychrolib).

## How to Interpret the Visualizations
See the [**Wiki**](https://github.com/mdahlhausen/epwvis/wiki) tab for more details on how to interpret weather data for environmental design and building energy modeling.

## How to Contribute
  1. Please suggest visualizations you would like to see and report bugs in the [**Issues**](https://github.com/mdahlhausen/epwvis/issues) tab above.
  2. If you would like to contribute a visualization, code it up, write a section on the wiki on why it is useful and how to interpret it, and then send me a pull request.

## Credits
  - Thanks to [Mostapha Roudsari](https://github.com/mostaphaRoudsari) and [Chris Mackey](https://github.com/chriswmackey) for [Ladybug](https://github.com/mostaphaRoudsari/ladybug) python code for parsing EPW files.  Other EPW parsers from [lmnarchitects](https://lmnarchitects.com/tech-studio/wp-content/uploads/sites/4/2014/04/Climate/epw-6hour.html) and René Buffat's [pyepw](https://github.com/rbuffat/pyepw) were helpful references.
  - This tool uses [D3.js](https://d3js.org/) developed by Mike Bostock, [crossfilter.js](http://square.github.io/crossfilter/), and [PsychroLib](github.com/psychrometrics/psychrolib).
  - The [CBE Clima Tool](https://clima.cbe.berkeley.edu) ([github](https://github.com/CenterForTheBuiltEnvironment/clima)) and the [CBE Thermal Comfort Tool](https://comfort.cbe.berkeley.edu) ([github](https://github.com/CenterForTheBuiltEnvironment/comfort_tool)) from the [Center for the Built Environment at UC Berkeley](https://cbe.berkeley.edu) were inspirations for the climate and psychrometric visualizations in this tool. The [pythermalcomfort](https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort) library documents the thermal comfort calculation methods used in those tools.
  - The Solar PV tab implements the [PVWatts® Version 8](https://pvwatts.nrel.gov) algorithm developed by the National Renewable Energy Laboratory (NREL), ported from NREL's open-source [SAM Simulation Core (SSC)](https://github.com/NREL/ssc) library (BSD-3-Clause). Key sub-models: sky-diffuse irradiance (Perez et al., 1990), incidence-angle modifier (De Soto et al., 2006), cell temperature (Fuentes, 1987 / IEC 61215), and inverter model (King et al., 2007).