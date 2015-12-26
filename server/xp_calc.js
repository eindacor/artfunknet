var starting_max_chunk = 1;
var chunk_exponent = .9;
var starting_xp  = 100;
var xp_exponent = 1.3;
var max_level = 50;

getXPChunk = function(current_level) {
	var chunk_percentage = starting_max_chunk * (Math.pow(chunk_exponent, current_level));
	if (getXPGoal(current_level) != -1)
		return Math.floor(chunk_percentage * getXPGoal(current_level));

	else return Math.floor(chunk_percentage * getXPGoal(49));
}

getXPGoal = function(current_level) {
	if (current_level < 50)
		return Math.floor(starting_xp * (Math.pow(xp_exponent, current_level)));

	else return -1;
}

logXPChunkPercentage = function(source, chunk_percentage) {
    if (chunk_percentage && source) {
        var specifier = {};
        var specifier_string = "xp";
        specifier[specifier_string] = {"$ne": undefined};

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

levelUp = function(user_id, level_count) {
	try {
		var current_level = Meteor.users.findOne(user_id).profile.level;
		var level_hit = current_level + level_count;
		Meteor.users.update(user_id, {$set : {'profile.level' : level_hit}});

		var level_message = "You have reached level " + level_hit + "!";
		var alert_object = {
	        'user_id' : user_id,
	        'message' : level_message,
	        'link' : '/',
	        'icon' : 'fa-star',
	        'sentiment' : "good",
	        'time' : moment()._d.toISOString()
	    };

	    alerts.insert(alert_object, function(error) {
	    	if(error)
	    		console.log(error.message);
	    });

		var cap_object_before= getCapSetterObject(current_level);
		var cap_object_after = getCapSetterObject(level_hit);

		var cap_keys = Object.keys(cap_object_after);
		for (var i=0; i < cap_keys.length; i++) {
			var key = cap_keys[i];
			var before_value = cap_object_before[key];
			var after_value = cap_object_after[key];

			if (before_value === after_value)
				continue;

			var setter = {};
			var setter_key = "profile." + key;
			setter[setter_key] = after_value;
			Meteor.users.update(user_id, {$set : setter});

			var message;

			switch(key) {
				case 'inventory_cap' : message = "Your inventory capacity has increased to " + after_value + "."; break;
		        case 'display_cap' : message = "Your display capacity has increased to " + after_value + "."; break;
		        case 'auction_cap' : message = "Your auction limit has increased to " + after_value + "."; break;
		        case 'ticket_cap' : message = "Your ticket limit has increased to " + after_value + "."; break;
		        case 'pc_cap' : message = "Your permanent collection capacity has increased to " + after_value + "."; break;
		        case 'visitor_cap' : message = "Your gallery's visitor capacity has increased to " + after_value + "."; break;
		        default: message = ""; break;
			}

			var alert_object = {
		        'user_id' : user_id,
		        'message' : message,
		        'link' : '/',
		        'icon' : 'fa-star',
		        'sentiment' : "good",
		        'time' : moment()._d.toISOString()
		    };

		    alerts.insert(alert_object, function(error) {
		    	if(error)
		    		console.log(error.message);
		    });
		}
	}

	catch(error) {
		console.log(error.message);
	}
}

addXP = function(user_id, xp) {
	if (procUniqueAttribute(user_id, "MONEY_FOR_XP", undefined)) {
		addFunds("MONEY_FOR_XP", user_id, xp * 2);
	}

	var xp_to_add = xp;
	var player_object = Meteor.users.findOne(user_id);
	var player_level = player_object.profile.level;
	var player_xp = player_object.profile.xp;
	var level_up_count = 0;

	while (xp_to_add > 0) {
		var xp_goal = getXPGoal(player_level + level_up_count);
		if (xp_goal != -1) {
			var remaining_xp = xp_goal - player_xp;

			if (remaining_xp > xp_to_add) {
				player_xp += xp_to_add;
				xp_to_add = 0;
			}

			else {
				level_up_count++;
				player_xp = 0;
				xp_to_add -= remaining_xp;
			}
		}

		else {
			player_xp += xp_to_add;
			xp_to_add = 0;
		}
	}

	if (level_up_count > 0)
		levelUp(user_id, level_up_count);

	Meteor.users.update(user_id, {$set: {'profile.xp' : player_xp}});
}

addXPChunkPercentage = function(source, user_id, chunk_percentage) {
	var chunk = getXPChunk(Meteor.users.findOne(user_id).profile.level);
	logXPChunkPercentage(source, chunk_percentage);
	addXP(user_id, Math.floor(chunk * chunk_percentage));
}
