var confirmTutorial = function(tutorial_name) {
	Meteor.call('confirmTutorial', tutorial_name, function(error) {
		if (error)
			console.log(error.message);
	})
}

var activateTutorial = function(tutorial_name) {
	Meteor.call('activateTutorial', tutorial_name, function(error) {
		if (error)
			console.log(error.message);
	})
}

Template.tutorialModal.events({
	'click .ok-button': function(element) {
		var tutorial_name = $(element.target).data().tutorial_name;
		var activate_name = $(element.target).data().activate;
		if (activate_name)
			activateTutorial(activate_name);

		$('.template-modalTemplate').remove();
		confirmTutorial(tutorial_name);
	},

	'click .next-button': function(element) {
		var tutorial_name = $(element.target).data().tutorial_name;
		$('.template-modalTemplate').remove();
		confirmTutorial(tutorial_name);
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tutorialModal", 
			'modal_data': $(element.target).data().next,
		}, $('body')[0]);
	}
})

Template.tutorialModal.helpers({
	'stringifyNext': function(next) {
		return JSON.stringify(next);
	}
})