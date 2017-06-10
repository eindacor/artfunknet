var leaderboard_data = undefined;
var leaderboard_data_tracker = new Tracker.Dependency;
var name_tracker = new Tracker.Dependency;
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
	},

	'rank' : function(index) {
		return index + 1;
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
		var item_object = undefined;
		for (var i=0; i<leaderboard_data.mvp_data.length && item_object == undefined; i++) {
			var leaderboard_item = leaderboard_data.mvp_data[i];
			if (leaderboard_item._id == item_id)
				item_object = leaderboard_item;
		}

		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "fullViewModal", 
			'modal_data': {
				'item_object': item_object
			}
		}, $('body')[0]);
	}
})