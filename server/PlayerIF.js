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
}