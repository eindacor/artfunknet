var starting_max_chunk = 1;
var chunk_exponent = .9;
var starting_xp  = 100;
var xp_exponent = 1.3;
var max_level = 50;

getXPChunk = function(current_level) {
	var chunk_percentage = starting_max_chunk * (Math.pow(chunk_exponent, (current_level == 50 ? 35 : current_level)));
	return Math.floor(chunk_percentage * getXPGoal(current_level));
}

getXPGoal = function(current_level) {
	if (current_level == 50)
		return 10000000;

	else return Math.floor(starting_xp * (Math.pow(xp_exponent, current_level)));
}

logXPChunkPercentage = function(source, chunk_percentage) {
    if (chunk_percentage && source) {
        var specifier = {};
        var specifier_string = "xp";
        specifier[specifier_string] = {"$ne": undefined};

        if (metadata.findOne(specifier) == undefined)
        	return;

        var xp_object = metadata.findOne(specifier).xp;

        if (xp_object.sources[source] == undefined) {
            xp_object.sources[source] = {
            	'count': 1,
            	'average_chunk_percentage': chunk_percentage,
            };
        }

        else {
        	xp_object.sources[source].average_chunk_percentage = Number(((xp_object.sources[source].count * xp_object.sources[source].average_chunk_percentage) + chunk_percentage) / (xp_object.sources[source].count + 1));
        	xp_object.sources[source].count += 1;
        }

        metadata.update(specifier, {'xp': xp_object});
    }
}

logMoneyMade = function(source, money_made) {
    if (money_made && source) {
        var specifier = {};
        var specifier_string = "money";
        specifier[specifier_string] = {"$ne": undefined};

        if (metadata.findOne(specifier) == undefined)
        	return;

        var money_object = metadata.findOne(specifier).money;

        if (money_object.sources[source] == undefined) {
            money_object.sources[source] = {
            	'count': 1,
            	'average_money_made': Number(money_made),
            };
        }

        else {
        	var previous_count = money_object.sources[source].count;
        	var new_count = previous_count + 1;
        	var previous_average = money_object.sources[source].average_money_made;
        	var new_average = Number(((previous_count * previous_average) + Number(money_made)) / new_count);
        	money_object.sources[source].average_money_made = new_average;
        	money_object.sources[source].count = new_count;
        }

        metadata.update(specifier, {'money': money_object});
    }
}

