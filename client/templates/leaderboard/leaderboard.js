var leaderboard_data = undefined;
var leaderboard_data_tracker = new Tracker.Dependency;
var name_tracker = new Tracker.Dependency;
var user_tracker = new Tracker.Dependency;
var user_map = {};
var item_owners = {};

var lookupOwner = function(item_id) {
	Meteor.call('lookupOwner', item_id, function(error, result) {
		if (error)
			console.log(error)

		else {
			item_owners[item_id] = result;
			name_tracker.changed();
		}
	});
}

var lookupUser = function(user_id) {
	Meteor.call('lookupUser', user_id, function(error, result) {
		if (error)
			console.log(error)

		else {
			user_map[user_id] = result;
			user_tracker.changed();
		}
	});
}

var setLeaderboardData = function() {
	Meteor.call('getLeaderboardData', function(error, result) {
		if (error)
			console.log(error.message);

		else {
			leaderboard_data = result;
			leaderboard_data_tracker.changed();
		}
	})
}

Template.leaderboard.helpers({
	'leaderboard_data': function() {
		leaderboard_data_tracker.depend();
		if (leaderboard_data == undefined) {
			setLeaderboardData();
		}

		else return leaderboard_data;
	}
})

Template.archiveValue.helpers({
	'user_name': function(user_id) {
		user_tracker.depend();
		if (user_map[user_id] == undefined) {
			lookupUser(user_id);
		}

		else return user_map[user_id];
	}
})

Template.archiveCount.helpers({
	'user_name': function(user_id) {
		user_tracker.depend();
		if (user_map[user_id] == undefined) {
			lookupUser(user_id);
		}

		else return user_map[user_id];
	}
})

Template.mvp.helpers({
	'owner_name': function(item_id) {
		name_tracker.depend();
		if (item_owners[item_id] == undefined) {
			lookupOwner(item_id);
		}

		else return item_owners[item_id];
	}
})

Template.leaderboard.rendered = function() {
	setLeaderboardData();
	item_owners = {};
}

Template.leaderboard.events({
	'click .mvp-row': function(event) {
		var item_id = $(event.target).closest('.mvp-row').data().item_id;
		var item_object = items.findOne(item_id);

		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "fullViewModal", 
			'modal_data': {
				'item_object': item_object
			}
		}, $('body')[0]);
	}
})