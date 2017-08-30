Template.tutorialMenuModal.helpers({
	'has_completed': function(tutorial_name) {
		return Meteor.user().profile.tutorial_data.completed.indexOf(tutorial_name) != -1;
	}
})

Template.tutorialMenuModal.events({
	'click .tutorial-item': function(element) {
		var tutorial_name = $(element.target).data().tutorial_name;
		Meteor.call('beginTutorial', tutorial_name, function(error, result) {
			if (error) {
				console.log(error);
			}
			else {
				$('.template-modalTemplate').remove();
			}
		})
	}
})