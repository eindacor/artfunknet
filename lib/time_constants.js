ONE_SECOND = 1000;
ONE_MINUTE = ONE_SECOND * 60;
ONE_HOUR = ONE_MINUTE * 60;
ONE_DAY = ONE_HOUR * 24;
ONE_WEEK = ONE_DAY * 7;
ONE_YEAR = ONE_DAY * 365;

getDurationString = function(duration, show_zeroes, units) {
	var duration_string = "";
	var smallest_unit;

	if (units.indexOf("y") != -1) {
		var years = Math.floor(duration / ONE_YEAR);
		if (show_zeroes || years > 0)
			duration_string += (years + "y ");

		duration %= ONE_YEAR;
		smallest_unit = "y";
	}

	if (units.indexOf("w") != -1) {
		var weeks = Math.floor(duration / ONE_WEEK);
		if (show_zeroes || weeks > 0)
			duration_string += (weeks + "w ");

		duration %= ONE_WEEK;
		smallest_unit = "w";
	}

	if (units.indexOf("d") != -1) {
		var days = Math.floor(duration / ONE_DAY);
		if (show_zeroes || days > 0)
			duration_string += (days + "d ");

		duration %= ONE_DAY;
		smallest_unit = "d";
	}

	if (units.indexOf("h") != -1) {
		var hours = Math.floor(duration / ONE_HOUR);
		if (show_zeroes || hours > 0)
			duration_string += (hours + "h ");

		duration %= ONE_HOUR;
		smallest_unit = "h";
	}

	if (units.indexOf("m") != -1) {
		var minutes = Math.floor(duration / ONE_MINUTE);
		if (show_zeroes || minutes > 0)
			duration_string += (minutes + "m ");

		duration %= ONE_MINUTE;
		smallest_unit = "m";
	}

	if (units.indexOf("s") != -1) {
		var seconds = Math.floor(duration / ONE_SECOND);
		if (show_zeroes || seconds > 0)
			duration_string += (seconds + "s ");

		smallest_unit = "s";
	}

	if (duration_string.length == 0 && smallest_unit != undefined)
		return "< 1" + smallest_unit;

	return duration_string;
}

display_earning_frequency = ONE_HOUR;
display_earning_check_frequency = ONE_MINUTE;
// how long it takes to level up your item's earning value
display_level_duration = ONE_HOUR;
display_level_cap = 20;

xp_earning_frequency = ONE_HOUR;

REPAIRING_CHECK_FREQUENCY = ONE_MINUTE;
REPAIRING_TICK_FREQUENCY = ONE_HOUR;

// if (DEBUG) {
// 	REPAIRING_CHECK_FREQUENCY = ONE_SECOND * 10;
// 	REPAIRING_TICK_FREQUENCY = ONE_SECOND * 20;
// }

NPC_SPAWN_FREQUENCY = ONE_MINUTE * 10;

DYNAMIC_CRATE_REFRESH_FREQUENCY = ONE_HOUR;
DYNAMIC_CRATE_CHECK_FREQUENCY = ONE_SECOND * 30;

LIABILITY_CHECK_FREQUENCY = ONE_MINUTE;
ACQUISITION_LIABILITY_CUTOFF = ONE_HOUR * 6;

if (DEBUG) {
	ACQUISITION_LIABILITY_CUTOFF = ONE_SECOND * 30;
}