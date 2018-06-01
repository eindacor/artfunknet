Template.archiveAllModal.events({
	'click #archive-all-confirm': function() {
		if (this.purchase) {
			Meteor.call('purchaseAndArchiveAllForSale', function(error){
				if (error)
					console.log(error);

				else {
					$('.template-modalTemplate').remove();
					updateItemArray();
				}
			})
		}

		else {
			Meteor.call('archiveAllUnclaimed', function(error){
				if (error)
					console.log(error);

				else {
					$('.template-modalTemplate').remove();
					updateItemArray();
				}
			})
		}
		
	}
})