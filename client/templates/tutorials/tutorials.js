var tutorial_button_tracker = new Tracker.Dependency;
var button_statuses;
var $tutorial_contents;

buildTutorialContents = function() {
	updateButtons();
	Meteor.call('getTutorialText', function(error, result) {
		if (error) {
			console.log(error)
		}
		else if (result) {
			$tutorial_contents = $('.tutorial-text');
			$tutorial_contents.empty();
			$tutorial_contents.append($(result));
		}
	})
}

var updateButtons = function() {
	Meteor.call('getTutorialStepPermissions', function(error, result) {
		if (error) {
			console.log(error);
		}
		else {
			button_statuses = result;
			tutorial_button_tracker.changed();
		}
	})
}

Template.tutorials.rendered = function() {
	button_statuses = undefined;
	buildTutorialContents();
}

Template.tutorials.events({
	'click #exit-tutorial': function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "exitTutorialModal", 
			'modal_data': {}
		}, $('body')[0]);
	}
})

Template.tutorialPageButtons.helpers({
	'button_statuses': function() {
		tutorial_button_tracker.depend();
		return button_statuses;
	}
})

Template.tutorialPageButtons.events({
	'click .back-button': function(event) {
		event.stopPropagation();
		Meteor.call('previousTutorialStep', function(error) {
			if (error) {
				console.log(error)
			}

			else {
				buildTutorialContents();
			}
		})
	},

	'click .next-button': function(event) {
		event.stopPropagation();
		Meteor.call('nextTutorialStep', function(error) {
			if (error) {
				console.log(error)
			}

			else {
				buildTutorialContents();
			}
		})
	},

	'click .finish-button': function(event) {
		event.stopPropagation();
		Meteor.call('finishTutorials', function(error) {
			if (error) {
				console.log(error)
			}

			buildTutorialContents();
			updateItemArray();
		})
	}
})