Template.purchaseModal.events({
	'click #purchase-artwork' : function(element) {
		var item_id = $(element.target).data().item_id;
		Meteor.call('purchaseItemFromDealer', item_id, function(error) {
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		});
	}
})