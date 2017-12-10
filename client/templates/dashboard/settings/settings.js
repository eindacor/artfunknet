var name_error = undefined;
var name_error_tracker = new Tracker.Dependency;

var changeScreenName = function(desired_name) {
	Meteor.call('changeScreenName', desired_name, function(error, result) {
		if(error)
			console.log(error.message)

		else {
			name_error = result;
			name_error_tracker.changed();
		}
	})
}

var updateSetting = function(setting_name, status) {
	Meteor.call('setPlayerSetting', setting_name, status, function(error) {
		if (error)
			console.log(error.message);
	})
}

Template.settings.helpers({
	'quick_purchase': function() {
		return Meteor.user().profile.settings.quick-purchase;
	},

	'user_data': function() {
		return Meteor.user();
	},

	'name_error': function() {
		name_error_tracker.depend();
		return name_error;
	},

	'is_patron': function() {
		return Meteor.user().profile.patreon_data && Meteor.user().profile.patreon_data.reward_data && Meteor.user().profile.patreon_data.reward_data.tier;
	}
})

Template.settingsBoolean.events({
	'click i.setting-true': function(event) {
		var setting_name = $(event.target).data().setting_name;
		updateSetting(setting_name, false);
	},

	'click i.setting-false': function(event) {
		var setting_name = $(event.target).data().setting_name;
		updateSetting(setting_name, true);
	}
})

Template.settings.events({
	'click #change-name': function() {
		var desired_name = $('#new-name')[0].value;
		changeScreenName(desired_name);
	}
})

Template.settings.rendered = function() {
	name_error = undefined;
}