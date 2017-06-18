Template.donateAllModal.events({
	'click #donate-all-confirm': function() {
		Meteor.call('donateAllUnclaimed', function(error){
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		})
	}
})