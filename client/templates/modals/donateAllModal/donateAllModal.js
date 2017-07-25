Template.donateAllModal.events({
	'click #donate-all-confirm': function() {
		if (this.purchase) {
			Meteor.call('purchaseAndDonateAllForSale', function(error){
				if (error)
					console.log(error.message);

				else {
					$('.template-modalTemplate').remove();
					updateItemArray();
				}
			})
		}

		else {
			Meteor.call('donateAllUnclaimed', function(error){
				if (error)
					console.log(error.message);

				else {
					$('.template-modalTemplate').remove();
					updateItemArray();
				}
			})
		}
	}
})