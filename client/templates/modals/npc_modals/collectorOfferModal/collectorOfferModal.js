Template.collectorOfferModal.helpers({
	'itemData' : function(offer_id) {
		return items.findOne(npc_data.findOne(offer_id).data.item_id);
	},

	'offerAmount': function(offer_id) {
		return getCommaSeparatedValue(npc_data.findOne(offer_id).data.offer_amount);
	}
})

Template.collectorOfferModal.events({
	'click #decline-button' : function(element) {
		Meteor.call('declineCollectorOffer', $(element.target).data().offer_id, function(error) {
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
			}
		});
	},

	'click #accept-button' : function(element) {
		Meteor.call('acceptCollectorOffer', $(element.target).data().offer_id, function(error) {
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
			}
		});
	}
})