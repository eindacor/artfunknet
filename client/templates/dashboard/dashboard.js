var current_section_tracker = new Tracker.Dependency;
var current_section = "profile";

Template.dashboard.helpers({
	'screen_name': function() {
		return Meteor.user().profile.screen_name;
	},

	'vintage_level': function() {
		return Meteor.user().profile.vintage_count
	},

	'current_section': function() {
		current_section_tracker.depend();
		return current_section;
	},

	'setSection': function(section_name) {
		current_section = section_name;
	},

	'patreon_tier': function() {
		if (Meteor.user().profile.patreon_data && Meteor.user().profile.patreon_data.reward_data) {
			var tier = Meteor.user().profile.patreon_data.reward_data.tier
			return tier ? tier : "af-color";
		}
		else return "af-color";
	}
})

Template.dashboardTab.helpers({
	'has_displaced': function(section_name) {
		return section_name == "archive" && new PlayerIF(Meteor.user()).hasDisplacedItems();
	}
})
