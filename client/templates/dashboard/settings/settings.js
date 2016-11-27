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