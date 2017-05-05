ONE_SECOND = 1000;
ONE_MINUTE = ONE_SECOND * 60;
ONE_HOUR = ONE_MINUTE * 60;
ONE_DAY = ONE_HOUR * 24;
ONE_WEEK = ONE_DAY * 7;
ONE_YEAR = ONE_DAY * 365;

getDurationString = function(duration, show_zeroes, units) {
	var duration_string = "";
	if (units.indexOf("d") != -1) {
		var days = Math.floor(duration / ONE_DAY)
		if (show_zeroes || days > 0)
			duration_string += (days + "d ");

		duration %= ONE_DAY;
	}

	if (units.indexOf("h") != -1) {
		var hours = Math.floor(duration / ONE_HOUR)
		if (show_zeroes || hours > 0)
			duration_string += (hours + "h ");

		duration %= ONE_HOUR;
	}

	if (units.indexOf("m") != -1) {
		var minutes = Math.floor(duration / ONE_MINUTE)
		if (show_zeroes || minutes > 0)
			duration_string += (minutes + "m ");

		duration %= ONE_MINUTE;
	}

	if (units.indexOf("s") != -1) {
		var seconds = Math.floor(duration / ONE_SECOND)
		if (show_zeroes || seconds > 0)
			duration_string += (hours + "s ");
	}

	console.log(duration_string);

	return duration_string;
}

display_earning_check_frequency = ONE_MINUTE * 10; //10 minutes
// how long it takes to level up your item's earning value
display_level_duration = ONE_DAY;
display_level_cap = 20;
// how many level durations can pass before display ends
display_level_max_increment_periods = 30;