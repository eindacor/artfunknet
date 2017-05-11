updateItemActions = function(item_object) {
	var permissions = getPlayerItemPermissions(Meteor.userId(), item_object._id);

	var button_area = $("[data-item_id='" + item_object._id + "']").find('.template-itemActions').find('.button-area');
	button_area.empty();
	if (permissions.canSell()) {
		button_area.append('<span class="quick-sell enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-usd"></i></span>');
	}

	if (permissions.canClaim()) {
		button_area.append('<span class="claim enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-plus"></i></span>');
	}

	if (permissions.canAuction()) {
		button_area.append('<span class="auction enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-gavel"></i></span>');
	}

	if (permissions.canDisplay()) {
		button_area.append('<span class="display inactive"><i data-item_id="' + item_object._id + '" class="appended fa fa-picture-o"></i></span>');
	}

	if (permissions.canUndisplay()) {
		button_area.append('<span class="display active af-color"><i data-item_id="' + item_object._id + '" class="appended fa fa-picture-o"></i></span>');
	}

	if (permissions.canReroll() || permissions.canChangeActiveUniqueAttribute()) {
		button_area.append('<span class="reroll enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-magic"></i></span>');
	}

	if (permissions.canDonate()) {
		button_area.append('<span class="donate enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-share-square"></i></span>');
	}

	if (permissions.canSetPermanent()) {
		button_area.append('<span class="perm-collection inactive"><i data-item_id="' + item_object._id + '" class="appended fa fa-heart"></i></span>');
	}

	if (permissions.canUnsetPermanent()) {
		button_area.append('<span class="perm-collection active af-color"><i data-item_id="' + item_object._id + '" class="appended fa fa-heart"></i></span>');
	}

	if (permissions.canPurchase()) {
		button_area.append('<span class="purchase enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-shopping-cart"></i></span>');
	}

	if (permissions.canDecline()) {
		button_area.append('<span class="decline enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-times"></i></span>');
	}

	button_area.append('<span class="tags enabled"><i data-item_id="' + item_object._id + '" class="appended fa fa-tags"></i></span>');
}

var getPermissions = function(item_object) {
	try {
		if (item_object) {
			var permissions = getPlayerItemPermissions(Meteor.userId(), item_object._id);
			if (permissions == undefined)
				return undefined;
			
			var sell = permissions.canSell();
			var claim = permissions.canClaim();
			var reroll = permissions.canReroll() || permissions.canChangeActiveUniqueAttribute();
			var purchase = permissions.canPurchase();
			var display = permissions.canDisplay();
			var undisplay = permissions.canUndisplay();
			var permanent = permissions.canSetPermanent();
			var unpermanent = permissions.canUnsetPermanent();
			var auction = permissions.canAuction();
			var decline = permissions.canDecline();
			var donate = permissions.canDonate();

			return {
				'sell': sell,
				'claim': claim,
				'reroll': reroll,
				'purchase': purchase,
				'display': display,
				'permanent': permanent,
				'unpermanent': unpermanent,
				'auction': auction,
				'decline': decline,
				'undisplay': undisplay,
				'donate': donate
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
})

Template.itemActions.events({
	'click .quick-sell.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canQuickDiscard()) {
			Meteor.call('sellItem', item_id, function(error) {
				if (error)
					console.log(error.message);

				else {
					Session.set('update_set', true);
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
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canAuction()) {
			Session.set('selectedItem', item_id);
			Modal.show('createAuctionModal');
		}
	},

	'click .display.inactive' : function(element, template) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canDisplay()) {
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

					//updateItemTemplate(item_id, 10);
				}
			})
		}
	},

	'click .display.active' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
			if (permissions.canUndisplay()) {
			Meteor.call('setItemDisplayStatus' , item_id, false, function(error) {
				if (error)
					console.log(error.message)

				else {
					//updateItemTemplate(item_id, 10);
				}
			})
		}
	},

	'click .reroll.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canReroll() || permissions.canChangeActiveUniqueAttribute()) {
			Session.set('selectedItem', item_id);
			Modal.show('rerollModal');
		}
	},

	'click .perm-collection.inactive' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canSetPermanent()) {
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

					//updateItemTemplate(item_id, 10);
				}
			})
		}
	},

	'click .perm-collection.active' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
			if (permissions.canUnsetPermanent()) {
			Meteor.call('setItemPermanentCollectionStatus' , item_id, false, function(error) {
				if (error)
					console.log(error.message)

				else {
					//updateItemTemplate(item_id, 10);
				}
			})
		}
	},

	'click .claim.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canClaim()) {
			Meteor.call('claimArtwork', item_id, function(error) {
				if (error)
					console.log(error.message);

				else {
					Session.set('update_set', true);
				}
			});
		}
	},

	'click .purchase.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (!permissions.canPurchase())
			return;

		if (Meteor.user().profile.settings.quick_purchase) {
			Meteor.call('purchaseItemFromDealer', item_id, function(error) {
				if (error)
					console.log(error.message);

				else {
					Session.set('update_set', true);
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
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canDecline()) {
			Meteor.call('declineItem', item_id, function(error) {
				if(error)
					console.log(error.message);

				else {
					Session.set('update_set', true);
				}
			})
		}
	},

	'click .tags.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canTag()) {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "tagItemModal", 
				'modal_data': {
					'item_data': items.findOne(item_id)
				}
			}, $('body')[0]);
		}
	},

	'click .donate.enabled' : function(element) {
		element.stopPropagation();
		var item_id = $(element.target).closest('.item-container').data('item_id');
		var permissions = getPlayerItemPermissions(Meteor.userId(), item_id);
		if (permissions.canQuickDiscard()) {
			Meteor.call('donateItem', item_id, function(error) {
				if (error)
					console.log(error.message);

				else {
					Session.set('update_set', true);
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