Template.purchaseModal.events({
	'click #purchase-artwork' : function(element) {
		var item_id = $(element.target).data().item_id;
		Meteor.call('purchaseItem', item_id, function(error) {
			if (error)
				console.log(error);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		});
	}
})