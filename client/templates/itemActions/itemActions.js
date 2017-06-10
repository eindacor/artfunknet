var getPermissions = function(item_object) {
	try {
		if (item_object) {
			var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_object));

			if (permissions == undefined)
				return undefined;
			
			var sell = permissions.canSell();
			var claim = permissions.canClaim();
			var purchase = permissions.canPurchase();
			var display = permissions.canDisplay();
			var undisplay = permissions.canUndisplay();
			var permanent = permissions.canSetPermanent();
			var unpermanent = permissions.canUnsetPermanent();
			var auction = permissions.canAuction();
			var decline = permissions.canDecline();
			var donate = permissions.canDonate();
			var tag_for_sale = permissions.canTagForSale();
			var untag_for_sale = permissions.canUntagForSale();
			var repairing = permissions.canSetRepairing();
			var unrepairing = permissions.canUnsetRepairing();
			var archive = permissions.canArchive();

			return {
				'sell': sell,
				'claim': claim,
				'purchase': purchase,
				'display': display,
				'permanent': permanent,
				'unpermanent': unpermanent,
				'auction': auction,
				'decline': decline,
				'undisplay': undisplay,
				'donate': donate,
				'tag_for_sale': tag_for_sale,
				'untag_for_sale': untag_for_sale,
				'repairing': repairing,
				'unrepairing': unrepairing,
				'archive': archive
			}
		}
	}

	catch(error) {
		console.log(error.message);
	}
}

Template.itemActions.helpers({
	'itemPermissions': function(item_data) {
		return getPermissions(item_data);
	},

	'recommended': function(item_data) {
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.userId()), new ItemIF(item_data));
		return player_item_interface.isRecommendedArchive();
	}
})

Template.itemActions.events({
	'click .quick-sell.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_id));
		if (permissions.canQuickDiscard()) {
			Meteor.call('sellItem', item_id, function(error) {
				if (error)
					console.log(error.message);

				else {
					updatePages();
				}
			});
		}

		else {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "quickSellModal", 
				'modal_data': items.findOne(item_id)
			}, $('body')[0]);
		}
	},

	'click .auction.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_id));
		if (permissions.canAuction()) {
			Session.set('selectedItem', item_id);
			Modal.show('createAuctionModal');
		}
	},

	'click .display.inactive' : function(element, template) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemDisplayStatus' , item_id, true, function(error) {
			if (error)
				console.log(error.message)

			else {
				if (Meteor.user().profile.tutorials.gallery && 
					items.findOne({'owner': Meteor.userId(), 'status': "displayed"}) && 
					items.findOne({'owner': Meteor.userId(), 'status': "permanent"})) 
				{
					Blaze.renderWithData(Template.modalTemplate, {
						'modal_name': "tutorialModal", 
						'modal_data': {
							'tutorial_name': "gallery",
							'next': undefined,
							'activate': "my_gallery",
							'image_filename': "tutorial/menu_gallery.png",
							'message': "Now that you have an item on display, and an item in your permanent collection, you can see your items in your gallery. Go there when you're ready, by clicking the 'My Gallery' button in the menu."
						}
					}, $('body')[0]);
				};

				updatePages();
			}
		})
	},

	'click .display.active' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemDisplayStatus' , item_id, false, function(error) {
			if (error)
				console.log(error.message)

			else {
				updatePages();
			}
		})
	},

	'click .reroll.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('rerollModal');
	},

	'click .perm-collection.inactive' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, true, function(error) {
			if (error)
				console.log(error.message)

			else {
				if (Meteor.user().profile.tutorials.gallery && 
					items.findOne({'owner': Meteor.userId(), 'status': "displayed"}) && 
					items.findOne({'owner': Meteor.userId(), 'status': "permanent"})) 
				{
					Blaze.renderWithData(Template.modalTemplate, {
						'modal_name': "tutorialModal", 
						'modal_data': {
							'tutorial_name': "gallery",
							'next': undefined,
							'activate': "my_gallery",
							'image_filename': "tutorial/menu_gallery.png",
							'message': "Now that you have an item on display, and an item in your permanent collection, you can see your items in your gallery. Go there when you're ready, by clicking the 'My Gallery' button in the menu."
						}
					}, $('body')[0]);
				};

				updatePages();
			}
		})
	},

	'click .perm-collection.active' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, false, function(error) {
			if (error)
				console.log(error.message)

			else {
				updatePages();
			}
		})
	},

	'click .tag-for-sale.inactive': function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setForSaleTag' , item_id, true, function(error) {
			if (error)
				console.log(error.message)

			else {
				updatePages();
			}
		})
	},

	'click .tag-for-sale.active': function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setForSaleTag' , item_id, false, function(error) {
			if (error)
				console.log(error.message)

			else {
				updatePages();
			}
		})
	},

	'click .repairing.active' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemRepairingStatus' , item_id, false, function(error) {
			if (error)
				console.log(error.message)

			else {
				updatePages();
			}
		})
	},

	'click .repairing.inactive' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemRepairingStatus' , item_id, true, function(error) {
			if (error)
				console.log(error.message)

			else {
				updatePages();
			}
		})
	},

	'click .claim.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('claimArtwork', item_id, function(error) {
			if (error)
				console.log(error.message);

			else {
				updatePages();
			}
		});
	},

	'click .purchase.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		if (Meteor.user().profile.settings.quick_purchase) {
			Meteor.call('purchaseItemFromDealer', item_id, function(error) {
				if (error)
					console.log(error.message);

				else {
					updatePages();
				}
			});
		}

		else {
			Session.set('selectedItem', item_id);
			Modal.show('purchaseModal');
		}
	},

	'click .decline.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('declineItem', item_id, function(error) {
			if(error)
				console.log(error.message);

			else {
				updatePages();
			}
		})
	},

	'click .archive.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "archiveModal", 
			'modal_data': items.findOne(item_id)
		}, $('body')[0]);
	},

	'click .tags.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tagItemModal", 
			'modal_data': {
				'item_data': items.findOne(item_id)
			}
		}, $('body')[0]);
	},

	'click .donate.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_id));
		if (permissions.canQuickDiscard()) {
			Meteor.call('donateItem', item_id, function(error) {
				if (error)
					console.log(error.message);

				else {
					updatePages();
				}
			});
		}

		else {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "donateModal", 
				'modal_data': items.findOne(item_id)
			}, $('body')[0]);
		}
	}
})