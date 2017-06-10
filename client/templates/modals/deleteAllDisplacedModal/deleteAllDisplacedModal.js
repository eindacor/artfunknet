Template.deleteAllDisplacedModal.events({
	'click #delete-all-confirm': function() {
		Meteor.call('deleteAllDisplaced', function(error){
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				updatePages();
			}
		})
	}
})