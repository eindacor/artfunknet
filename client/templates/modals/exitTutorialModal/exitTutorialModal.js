Template.exitTutorialModal.events({
	'click #end-tutorial': function() {
		Meteor.call('finishTutorials', function(error) {
			if (error) {
				console.log(error);
			}
		})

		$('.template-modalTemplate').remove();
	}
})