Template.archiveAllModal.events({
	'click #archive-all-confirm': function() {
		Meteor.call('archiveAllUnclaimed', function(error){
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		})
	}
})