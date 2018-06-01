Template.identifyForgeryModal.events({
	'click #identify-artwork' : function(element) {
		var item_id = $(element.target).data().item_id;
		Meteor.call('identifyItem', item_id, function(error) {
			if (error)
				console.log(error);

			else {
				$('.template-modalTemplate').remove();
				updateItemArray();
			}
		});
	}
})

Template.identifyForgeryModal.helpers({
	'identify_cost': function(item_id) {
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
		return player_item_interface.getIdentifyCost();
	}
})