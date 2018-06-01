var leaderboard_data = undefined;
var leaderboard_data_tracker = new Tracker.Dependency;
var selected_leaderboard_tracker = new Tracker.Dependency;
var name_tracker = new Tracker.Dependency;
var user_tracker = new Tracker.Dependency;
var user_map = {};
var item_owners = {};
var selected_key;

var getLeaderboardName = function(key) {
	switch (key) {
		case 'mvp_data': return "active item value";
        case 'mvp_data_common': return "common item value";
        case 'mvp_data_uncommon': return "uncommon item value";
        case 'mvp_data_rare': return "rare item value";
        case 'mvp_data_legendary': return "legendary item value";
        case 'mvp_data_masterpiece': return "masterpiece item value";
        case 'archived_mvp_data': return "archived item value";
        case 'archived_mvp_data_common': return "archived common item value";
        case 'archived_mvp_data_uncommon': return "archived uncommon item value";
        case 'archived_mvp_data_rare': return "archived rare item value";
        case 'archived_mvp_data_legendary': return "archived legendary item value";
        case 'archived_mvp_data_masterpiece': return "archived masterpiece item value";
        case 'gallery_score_data': return "gallery score";
        case 'gallery_value_data': return "gallery value";
        case 'gallery_earnings_data': return "gallery earnings";
        case 'jobs_completed_data': return "quests completed";
        case 'money_spent_crates_data': return "money spent on crates";
        case 'archive_value_data': return "archive value";
        case 'archive_count_data': return "archived items";
        default: break;
	}
}

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
			console.log(error);

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

	'leaderboard': function() {
		leaderboard_data_tracker.depend();
		if (leaderboard_data != undefined) {
			return Object.keys(leaderboard_data);
		}
	},

	'selected_leaderboard': function() {
		leaderboard_data_tracker.depend();
		selected_leaderboard_tracker.depend();

		if (selected_key == undefined) {
			if (leaderboard_data != undefined) {
				selected_key = Object.keys(leaderboard_data)[0];
			}

			else return;
		}

		return {
			'key': selected_key,
			'data': leaderboard_data[selected_key],
			'title': getLeaderboardName(selected_key)
		};
	},

	'leaderboard': function() {
		leaderboard_data_tracker.depend();
		if (leaderboard_data != undefined) {
			var leaderboard_keys = Object.keys(leaderboard_data);

			var leaderboards = [];

			for (var i=0; i<leaderboard_keys.length; i++) {
				leaderboards.push({
					'name': getLeaderboardName(leaderboard_keys[i]),
					'key': leaderboard_keys[i]
				})
			}

			return leaderboards;
		}
	}
})

Template.leaderboard.events({
	'click .leaderboard-title': function(event) {
		selected_key = $(event.target).data().leaderboard_key;
		selected_leaderboard_tracker.changed();
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
	selected_key = undefined;
}

Template.leaderboard.events({
	'click .mvp-row': function(event) {
		var item_id = $(event.target).closest('.mvp-row').data().item_id;

		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "fullViewModal", 
			'modal_data': {
				'item_id': item_id
			}
		}, $('body')[0]);
	}
})