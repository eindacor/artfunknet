Template.itemActions.helpers({
	'canSell': function(item_data) {
		return ['claimed', 'unclaimed'].indexOf(item_data.status) != -1;
	},

	'canClaim': function(item_data) {
		return ['unclaimed', 'won'].indexOf(item_data.status) != -1;
	},

	'canReroll': function(item_data) {
		return ['claimed'].indexOf(item_data.status) != -1;
	},

	'canPurchase': function(item_data) {
		return ['for_sale'].indexOf(item_data.status) != -1;
	},
})

Template.itemActions.events({
	'click .quick-sell.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var item_object = items.findOne(item_id);

		var user_object = Meteor.user();
		//TODO add sought filter
		if (
			user_object.profile.settings.quick_sell_options.standard &&
   			item_object.artwork_data.rarity != "masterpiece" &&
   			!item_object.seasonal &&
   			item_object.lottery == 0 &&
			(!item_object.foil || user_object.profile.settings.quick_sell_options.foil) &&
			(item_object.artwork_data.rarity != "legendary" || user_object.profile.settings.quick_sell_options.legendary) &&
			(quests.findOne({'owner_id': Meteor.userId(), 'target': {$in: [item_object.artwork_id]}}) == undefined || user_object.profile.settings.quick_sell_options.quest_items)
			) {
			Meteor.call('sellArtwork', item_id, function(error) {
				if (error)
					console.log(error.message);
			});
		}

		else {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "quickSellModal", 
				'modal_data': items.findOne(item_id)
			}, $('body')[0]);
		}
	},
})