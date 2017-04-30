Template.quickSellModal.events({
	'click #sell-artwork' : function(element) {
		var item_id = $(element.target).data().item_id;
		Meteor.call('sellItem', item_id, function(error) {
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				Session.set('update_set', true);
			}
		});
	}
})