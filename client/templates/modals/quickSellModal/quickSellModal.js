Template.quickSellModal.events({
	'click #sell-artwork' : function(element) {
		var item_id = $(element.target).data().item_id;
		console.log(item_id);
		Meteor.call('sellArtwork', item_id, function(error) {
			if (error)
				console.log(error.message);

			else $('.template-modalTemplate').remove();;
		});
	}
})