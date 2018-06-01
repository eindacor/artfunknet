Template.deleteModal.events({
	'click #delete-item' : function(element) {
		var item_id = $(element.target).data().item_id;
		Meteor.call('deleteItem', item_id, function(error) {
			if (error)
				console.log(error);

			else {
				$('.template-modalTemplate').remove();
				refreshItemSet();
			}
		});
	}
})