var getPermissions = function(item_object) {
	try {
		if (item_object) {
			var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_object));

			if (permissions == undefined)
				return undefined;
			
			var permission_object = {
				'sell': permissions.canSell(),
				'claim': permissions.canClaim(),
				'purchase': permissions.canPurchase(),
				'display': permissions.canDisplay(),
				'permanent': permissions.canSetPermanent(),
				'unpermanent': permissions.canUnsetPermanent(),
				'auction': permissions.canAuction(),
				'decline': permissions.canDecline(),
				'undisplay': permissions.canUndisplay(),
				'donate': permissions.canDonate(),
				'tag_for_sale': permissions.canTagForSale(),
				'untag_for_sale': permissions.canUntagForSale(),
				'repairing': permissions.canSetRepairing(),
				'unrepairing': permissions.canUnsetRepairing(),
				'archive': permissions.canArchive(),
				'forge': permissions.canForge()
			}

			return permission_object;
		}
	}

	catch(error) {
		console.log(error.message);
	}
}

Template.itemActions.helpers({
	'itemPermissions': function(item_data) {
		return getPermissions(item_data);
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
					updateItemArray();
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
				updateItemArray();
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
				updateItemArray();
			}
		})
	},

	'click .reroll.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		// Session.set('selectedItem', item_id);
		// Modal.show('rerollModal');
		var item_interface = new ItemIF(item_id);
		//$('.template-inventory').remove();
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "rerollModal", 
			'modal_data': {
				'item_data': item_interface.getItemObject()
			}
		}, $('body')[0]);
	},

	'click .perm-collection.inactive' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemPermanentCollectionStatus' , item_id, true, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemArray();
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
				updateItemArray();
			}
		})
	},

	'click .tag-for-sale.inactive': function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setForSaleTag' , item_id, true, function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'click .tag-for-sale.active': function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setForSaleTag' , item_id, false, function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'click .repairing.active' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Meteor.call('setItemRepairingStatus' , item_id, false, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemArray();
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
				updateItemArray();
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
				updateItemArray();
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
					updateItemArray();
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
				updateItemArray();
			}
		})
	},

	'click .delete.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "deleteModal", 
			'modal_data': items.findOne(item_id)
		}, $('body')[0]);
	},

	'click .archive.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).data('item_id');
		var archive_target = items.findOne(item_id);
		archive_target.displaced = false;
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "archiveModal", 
			'modal_data': archive_target
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
					updateItemArray();
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