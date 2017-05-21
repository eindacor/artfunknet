getNPCQuality = function(player_level) {
	var npc_quality_map = {
		'bronze' : 12,
		'silver' : 10,
		'gold' : 8,
		'platinum' : 6
	}

	return JepLoot.catRoll(npc_quality_map);
}

createNPC = function(gallery_object, attribute_id, duration, npc_quality) {
    var npc_object = {
        'quality' : npc_quality,
        'attribute_id' : attribute_id,
        'owner_id' : gallery_object.owner_id,
        'expiration' : moment().add(duration, 'milliseconds')._d.toISOString(),
        'players_met' : [],
        'icon' : attributes.findOne(attribute_id).icon
    }

    npcs.insert(npc_object, function(error, inserted_id) {
        if (error)
            console.log(error.message)
    })
}

var ignoreNPC = function(npc_id) {
	var npc_validation_response = canMeetNPC(npc_id);
	var npc_object = npc_validation_response.npc_object;

	if (npc_object == undefined) {
		return {'message': npc_validation_response.error};
	}

	Meteor.users.update(Meteor.userId(), {$set: {'profile.last_npc_met': moment()._d.toISOString()}});
	npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
	return true;
}

var interactWithNPC = function(npc_id) {
	var npc_validation_response = canMeetNPC(npc_id)
	var npc_object = npc_validation_response.npc_object;

	if (npc_object == undefined) {
		return {'message': npc_validation_response.error};
	}

	var inc_object = {};
	var inc_string = 'profile.npcs_met.' + npc_object.quality;
	inc_object[inc_string] = 1;

	Meteor.users.update(Meteor.userId(), {$set: {'profile.last_npc_met': moment()._d.toISOString()}, $inc: inc_object});

	var attribute_object = attributes.findOne(npc_object.attribute_id);		
	var npc_interaction = {};

	switch(attribute_object.title) {
		case "benefactor_bonus": 
			npc_interaction = benefactorInteraction(npc_object);
			break;
		case "donor_bonus": 
			npc_interaction = donorInteraction(npc_object);
			break;
		case "preservationist_bonus": 
			npc_interaction = preservationistInteraction(npc_object);
			break;
		case "gallery_manager":
			npc_interaction = galleryManagerInteraction(npc_object);
			break;
		case "set_xp_visitors": //DISABLE - give portion of set xp to visitors
			npc_interaction = {'message': "You have been given 0xp for sets in this permanent collection."};
			break;
		case "xp_visitors": //DISABLE - give portion of collection xp to visitors
			npc_interaction = {'message': "You have been given 0xp for works in this permanent collection."};
			break;
		case "dealer_bonus":
			npc_interaction = artDealerInteraction(npc_object);
			break;
		case "collector_bonus":
			npc_interaction = collectorInteraction(npc_object);
			break;
		case "marketing_manager_bonus":
			npc_interaction = marketingManagerInteraction(npc_object);
			break;
		case "forger_bonus": //DISABLE - give access to black market
			npc_interaction = {'message': "You have met an art forger."};
			break;
		case "art_expert_bonus":
			npc_interaction = artExpertInteraction(npc_object);
			break;
		case "historian_bonus": //DISABLE - quiz players for xp
			npc_interaction = historianInteraction(npc_object);
			break;
		case "auctioneer_bonus": //DISABLE - analyze auction house and return deals
			npc_interaction = auctioneerInteraction(npc_object);
			break;
		case "entry_fee_reduction_members": //DISABLE = reduce entry fee for members
		case "set_xp_members": //DISABLE - give portion of set xp to members
		case "xp_members": //DISABLE - give portion of xp to members
		case "xp_per_visitor": //DISABLE - increase xp gain per visitor
		case "money_per_visitor": //DISABLE - increase money earned for entry fee
		case "bonus_money": //DISABLE - bonus money from feature paintings
		case "enthusiast_bonus": //give xp
			npc_interaction = enthusiastInteraction(npc_object);
			break;
		default: return undefined;
	}

	npcs.update(npc_id, {$push: {'players_met' : Meteor.userId()}});
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
