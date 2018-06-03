NPC_QUALITY_MAP_CACHE = undefined;

getNPCQuality = function(player_level) {
	if (NPC_QUALITY_MAP_CACHE == undefined) {
		var npc_quality_map = {
			'bronze' : 12,
			'silver' : 10,
			'gold' : 8,
			'platinum' : 6
		}

		NPC_QUALITY_MAP_CACHE = new MapCacheIF(npc_quality_map);
	}

	return NPC_QUALITY_MAP_CACHE.getRandom();
}

createNPC = function(gallery_object, attribute_id, duration, npc_quality) {
	var attribute_object = getOneFromCollection("createNPC()", attributes, attribute_id);

	var icon;
	var npc_name;

	if (attribute_object.npc_name == "Forger") {
		var attribute_query = {'active': true, 'npc_name': {$ne: "Forger"}};
		var active_attribute_count = getFromCollection("createNPC()", attributes, attribute_query).count();
		var disguise = attributes.findOne(attribute_query, {skip: Math.floor(Math.random() * active_attribute_count)});
		icon = disguise.icon;
		npc_name = disguise.npc_name;
	}
	else {
		icon = attribute_object.icon;
		npc_name = attribute_object.npc_name;
	}

    var npc_object = {
        'quality' : npc_quality,
        'attribute_id' : attribute_id,
        'owner_id' : gallery_object.owner_id,
        'expiration' : moment().add(duration, 'milliseconds')._d.toISOString(),
        'players_met' : [],
        'icon' : icon,
        'npc_name': npc_name
    }

    npcs.insert(npc_object, function(error, inserted_id) {
        if (error)
            console.log(error)
    })
}

var ignoreNPC = function(npc_id) {
	var npc_validation_response = canMeetNPC(npc_id);
	var npc_object = npc_validation_response.npc_object;

	if (npc_object == undefined) {
		return {'message': npc_validation_response.error};
	}

	var player_interface = new PlayerIF(Meteor.user());
	player_interface.registerActivity();
	npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
	return true;
}

var interactWithNPC = function(npc_id) {
	var player_interface = new PlayerIF(Meteor.user());
	var npc_validation_response = canMeetNPC(npc_id)
	var npc_object = npc_validation_response.npc_object;

	if (npc_object == undefined) {
		return {'message': npc_validation_response.error};
	}

	var remember_interaction = true;

	if (isOwnGallery(npc_object) && player_interface.procUniqueAttribute("MULTIPLE_VISITOR_INTERACTIONS", undefined) && Math.random() < .1) {
        remember_interaction = false;
    }

    if (remember_interaction) {
    	npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
    }

    var current_visitor_ignore_proc_count = player_interface.getUserObject().profile.visitor_ignore_proc_count;
    var current_visitor_ignore_coefficient = player_interface.getUserObject().profile.visitor_ignore_coefficient;

    var ignore_player = current_visitor_ignore_coefficient > 0 && Math.random() < current_visitor_ignore_coefficient;

    var inc_object = {};
	var npcs_met_string = 'profile.npcs_met.' + npc_object.quality;
	inc_object[npcs_met_string] = 1;
	
	var setter_object = {};
	var last_activity_key = 'profile.last_activity';
	setter_object[last_activity_key] = moment()._d.toISOString();

    if (current_visitor_ignore_proc_count > 0) {
    	var ignore_string = 'profile.visitor_ignore_proc_count';
		inc_object[ignore_string] = -1;

    	if (current_visitor_ignore_proc_count == 1) {
    		var reset_ignore_string = 'profile.visitor_ignore_coefficient';
    		setter_object[reset_ignore_string] = 0;
    	}
    }

	Meteor.users.update(player_interface.getId(), {$set: setter_object, $inc: inc_object});

	if (ignore_player) {
		return {'message': "This visitor would rather not be associated with you at this time."}
	}
		
	var npc_interaction = {};
	var associated_attribute = attributes.findOne(npc_object.attribute_id);

	if (associated_attribute == undefined) {
		return {'message': "unkown npc type"};
	}

	switch(associated_attribute.npc_name) {
		case "Benefactor": 
			npc_interaction = benefactorInteraction(npc_object, player_interface);
			break;
		case "Art Donor": 
			npc_interaction = donorInteraction(npc_object, player_interface);
			break;
		case "Preservationist": 
			npc_interaction = preservationistInteraction(npc_object, player_interface);
			break;
		case "Art Dealer":
			npc_interaction = artDealerInteraction(npc_object, player_interface);
			break;
		case "Art Collector":
			npc_interaction = collectorInteraction(npc_object, player_interface);
			break;
		case "Marketing Manager":
			npc_interaction = marketingManagerInteraction(npc_object, player_interface);
			break;
		case "Forger":
			npc_interaction = forgerInteraction(npc_object, player_interface);
			break;
		case "Art Expert":
			npc_interaction = artExpertInteraction(npc_object, player_interface);
			break;
		case "Art Historian":
			npc_interaction = historianInteraction(npc_object, player_interface);
			break;
		case "Auctioneer":
			npc_interaction = auctioneerInteraction(npc_object, player_interface);
			break;
		case "Art Enthusiast":
			npc_interaction = enthusiastInteraction(npc_object, player_interface);
			break;
		default: return undefined;
	}

	return npc_interaction;
}

Meteor.methods({
	'interactWithNPC' : function(npc_id) {
		return interactWithNPC(npc_id);
	}, 

	'ignoreNPC': function(npc_id) {
		return ignoreNPC(npc_id);
	}
})

isOwnGallery = function(npc_object) {
	return npc_object.owner_id == Meteor.userId();
}

getMapAmplifierFromNPC = function(npc_object) {
	var map_amplifier;

	switch(npc_object.quality) {
        case 'bronze': map_amplifier = 0; break;
        case 'silver': map_amplifier = .2; break;
        case 'gold': map_amplifier = .4; break;
        case 'platinum': map_amplifier = .8; break;
        default: map_amplifier = 0; break;
    }

    return map_amplifier;
}
