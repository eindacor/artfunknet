Template.help.events({
	'click #reset-tutorials': function() {
		Meteor.call('resetTutorials', function(error) {
			if (error)
				console.log(error.message);
		})
	}
})

Template.help.helpers({
	'showResetButton': function() {
		return (!Meteor.user().profile.tutorials.welcome);
	}
})