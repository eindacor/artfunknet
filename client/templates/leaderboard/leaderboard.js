var leaderboard_data = undefined;

var leaderboard_data_tracker = new Tracker.Dependency;

var setLeaderboardData = function() {
	Meteor.call('getLeaderboardData', function(error, result) {
		if (error)
			console.log(error.message);

		else {
			console.log(result);
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

Template.leaderboard.rendered = function() {
	setLeaderboardData();
}

Template.leaderboard.events({
	'click .mvp-row': function(event) {
		var item_id = $(event.target).closest('.mvp-row').data().item_id;
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "fullViewModal", 
			'modal_data': {
				'item_data': items.findOne(item_id)
			}
		}, $('body')[0]);
	}
})