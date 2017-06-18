Template.donateModal.events({
	'click #donate-artwork' : function(element) {
		var item_id = $(element.target).data().item_id;
		Meteor.call('donateItem', item_id, function(error) {
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		});
	}
})