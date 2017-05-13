PlayerIF = function(user_id) {
	var user_object = Meteor.users.findOne(user_id);

	if (user_object == undefined)
		throw "invalid user: " + user_id;

	this.getUserObject = function() {
		return user_object;
	}

	this.isRecentlyActive = function() {
		var recent_cutoff = ONE_DAY * 30;
		var last_npc_met = user_object.profile.last_npc_met;
		var now = moment()._d.toISOString();
		if (last_npc_met == undefined) {
			Meteor.users.update(user_id, {$set: {'profile.last_npc_met': now}})
			return true;
		}

		var time_passed = moment(now) - moment(last_npc_met);
		return time_passed < recent_cutoff;
	}

	this.getKnowledge = function() {
		return user_object.profile.knowledge;
	}

	this.giveKnowledge = function(knowledge_object) {
		var keys = Object.keys(knowledge_object);
		var inc_object = {};
		for (var i=0; i<keys.length; i++) {
			var amount = knowledge_object[keys[i]];
			var inc_string = 'profile.knowledge.' + keys[i];
			inc_object[inc_string] = amount;
		}
		Meteor.users.update({'_id': user_id}, {$inc: inc_object});
	}

	this.giveKnowledgeByUnits = function(units) {
		this.giveKnowledge(convertUnitCostToKnowledge(units));
	}

	this.getQuickDiscardableItemIds = function() {
	    var item_ids = [];

	    items.find({
	        'owner': user_id,
	        'status': {$in: ["unclaimed", "won"]}, 
	    }).forEach(function(item_object) {
	        var permissions = getPlayerItemPermissions(user_id, item_object._id);
	        if (permissions.canQuickDiscard()) {
	            item_ids.push(item_object._id);
	        }
	    });

	    return item_ids;
	}
}