Template.deleteAllDisplacedModal.events({
	'click #delete-all-confirm': function() {
		Meteor.call('deleteAllDisplaced', function(error){
			if (error)
				console.log(error);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		})
	}
})