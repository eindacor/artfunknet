var applyDisplayDetails = function(player_item_interface) {
	Meteor.call('getDisplayDetailsFromInterface', player_item_interface.getPlayerIF().getUserObject(), player_item_interface.getItemIF().getItemObject(), function(error, result) {
		if (error) {
			console.log(error);
		}

		else {
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
			var container_id = '#display_mask_' + player_item_interface.getItemIF().getId();
			var $mask_info_container = $(container_id);	
			$mask_info_container.empty();
			$mask_info_container.append($('<p><i class="text-shadow fa fa-picture-o"></i></p>'));
			$mask_info_container.append($('<p class="display-details">' + getDurationString(moment() - moment(time_since_displayed), false, "dhm") + '</p>'));
			$mask_info_container.append($('<p class="display-details green-text text-shadow">$' + getCommaSeparatedValue(result.money_per_hour) + '/hr.</p>'));
			$mask_info_container.append($('<p class="display-details af-color text-shadow">' + getCommaSeparatedValue(result.xp_per_hour) + 'xp/hr.</p>'));
		}
	})
}

var applyForgeryStamp = function(player_item_interface) {
	Meteor.call('detectOwnForgery', player_item_interface.getPlayerIF().getUserObject(), player_item_interface.getItemIF().getId(), function(error, result) {
		if (error) {
			console.log(error);
		}

		else if (result) {
			var indicator_id = "#indicators_" + player_item_interface.getItemIF().getId();
			if ($(indicator_id + " > i.fa-user-secret").length == 0) {
				var $container = $(indicator_id);
				$container.append($('<i class="red-text fa fa-user-secret text-shadow"></i>'));
			}
		}
	})
}

getStatusMaskHTML = function(player_item_interface) {
	var $status_mask = undefined;
	var item_object = player_item_interface.getItemIF().getItemObject();

	switch(item_object.status) {
		case "displayed":
			$status_mask = $("<div class='status-mask'></div>");
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;	
			var mask_id_string = 'display_mask_' + player_item_interface.getItemIF().getId();
			var $mask_info_container = $("<div class='mask-info-container' id='" + mask_id_string + "'></div>");
			$mask_info_container.append($('<p><i class="text-shadow fa fa-picture-o"></i></p>'));
			$mask_info_container.append($('<p class="display-details">' + getDurationString(moment() - moment(time_since_displayed), false, "dhm") + '</p>'));
			$mask_info_container.append($('<p class="display-details green-text text-shadow">$' + getCommaSeparatedValue(player_item_interface.getDisplayValuePerHour()) + '/hr.</p>'));
			$mask_info_container.append($('<p class="display-details af-color text-shadow">' + getCommaSeparatedValue(player_item_interface.getXPPerHour()) + 'xp/hr.</p>'));
			$status_mask.append($mask_info_container);
			applyDisplayDetails(player_item_interface);
			break;
		case "auctioned":
			$status_mask = $("<div class='status-mask'></div>");
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
			$status_mask.append($('<i class="text-shadow fa fa-gavel"></i>'));
			break;
		default: 
			if (item_object.repairing) {
				$status_mask = $("<div class='status-mask'></div>");
				var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
				var $mask_info_container = $("<div class='mask-info-container'></div>");
				if (item_object.condition < 1) {
					$mask_info_container.append($('<p><i class="text-shadow fa fa-wrench"></i></p>'));
					$mask_info_container.append($('<p class="display-details text-shadow">' + Math.floor(item_object.condition * 100) + '%</p>'));
				}

				else {
					$mask_info_container.append($('<p><i class="text-shadow fa fa-wrench green-text"></i></p>'));
					$mask_info_container.append($('<p class="display-details text-shadow green-text">' + Math.floor(item_object.condition * 100) + '%</p>'));
				}

				$status_mask.append($mask_info_container);
			}
			else if (item_object.permanent) {
				$status_mask = $("<div class='status-mask'></div>");
				var $mask_info_container = $("<div class='mask-info-container'></div>");
				$mask_info_container.append($('<p><i class="text-shadow af-color fa fa-heart"></i></p>'));
				$status_mask.append($mask_info_container);
			}
			break;
	}

	return $status_mask;
}

var getBasicInfoHTML = function(player_item_interface) {
	var $container = $('<div class="row no-margin"></div>');
	var $header_basic_info = $('<div class="header-basic-info"></div>');

	var already_owns_string = player_item_interface.alreadyOwnsArtwork() ? "* " : " ";
	$header_basic_info.append($('<p class="item-title work-title">' + already_owns_string + player_item_interface.getItemIF().getItemObject().artwork_data.title + '</p>'));
	$header_basic_info.append($('<p>' + player_item_interface.getItemIF().getItemObject().artwork_data.artist + '</p>'));

	$container.append($header_basic_info);
	return $container;
}

var getDetailsHTML = function(player_item_interface) {
	var $container = $('<div class="row no-margin"></div>');
	var $header_details = $('<div class="header-details"></div>');

	var artwork_data = player_item_interface.getItemIF().getItemObject().artwork_data;
	$header_details.append($('<p>' + artwork_data.date + '</p>'));
	$header_details.append(getItemSignatureHTML(player_item_interface.getItemIF(), true));
	$header_details.append($('<p>' + artwork_data.medium + '</p>'));
	$header_details.append($('<p>' + artwork_data.height + ' x ' + artwork_data.width + '</p>'));

	var show_details = true; //TODO replace with logic
	var $item_specs = $('<div class="dynamic-stats"></div>');
	if (show_details) {		
		var condition = player_item_interface.getItemIF().getItemObject().condition;
		var condition_string = Math.floor()
		$item_specs.append($('<p>condition: <span style="color: ' + getHTMLColorFromValue(condition) + '">' + Math.floor(condition * 100) + '%</span></p>'));
		$item_specs.append($('<p id="dynamic-value-stat">estimated value: ' + getMoneyValue(player_item_interface.getItemIF().getItemObject().values.actual) + '</p>'));
		$item_specs.append($('<p id="dynamic-roll-count-stat">roll count: ' + player_item_interface.getItemIF().getItemObject().roll_count + '</p>'));

		if (player_item_interface.getItemIF().isIdentifiedForgery()) {
			var forgery_quality = player_item_interface.getItemIF().getItemObject().authenticity.forgery_quality;
			$item_specs.append($('<p id="forgery-quality-stat">forgery quality: <span style="color: ' + getHTMLColorFromValue(forgery_quality) + '">' + Math.floor(forgery_quality * 100) + '%</span></p>'));
		}

		else if (!player_item_interface.getItemIF().isForgery() && player_item_interface.getItemIF().isIdentified()) {
			$item_specs.append($('<p id="verified-text" class="green-text"><i class="fa fa-check"></i> verified</p>'));
		}

	}

	else {
		$item_specs.append($('<p>condition: ?</p>'));
		$item_specs.append($('<p>estimated value: ?</p>'));
		$item_specs.append($('<p>roll count: ?</p>'));
	}
	$header_details.append($item_specs);

	var rarity = player_item_interface.getItemIF().getRarity();
	if (rarity == "legendary" || rarity == "masterpiece") {
		var $flavor_area = $('<div class="flavor-area"></div>');
		var unique_flavor = unique_attributes.findOne(player_item_interface.getItemIF().getItemObject().active_unique_attribute).flavor_text;
		$flavor_area.append($('<p class="flavor-text af-color">"' + unique_flavor + '"</p>'));
		$header_details.append($flavor_area);
	}

	$container.append($header_details);
	return $container;
}

var getIndicatorsHTML = function(player_item_interface) {
	var indicator_id = "indicators_" + player_item_interface.getItemIF().getId();
	var $container = $('<div id="' + indicator_id + '" class="row no-margin indicator-area"></div>');
	var recommended_status = player_item_interface.getRecommendedStatus();
	if (recommended_status.displaced_item) {
		if (recommended_status.upgrade) {
			$container.append($('<i class="green-text fa fa-level-up text-shadow"></i>'));
		}
	}

	else {
		$container.append($('<i class="green-text fa fa-archive text-shadow"></i>'));
	}

	if (player_item_interface.isQuestTarget()) {
		$container.append($('<i class="green-text fa fa-flag-checkered text-shadow"></i>'));
	}

	// if (player_item_interface.isSought()) {
	// 	$container.append($('<i class="blue-text fa fa-bullhorn text-shadow"></i>'));
	// }

	applyForgeryStamp(player_item_interface);

	return $container;
}

var getAttributeHTML = function(attribute, attribute_type) {
	return $('<i data-attribute_description="' + attribute.description + '" data-attribute_value="' + attribute.value + '" style="color: ' + getHTMLColorFromValue(attribute.value) + '" class="' + attribute_type + '-attribute item-attribute-built fa ' + attribute.icon + '"></i>');
}

var getFooterHTML = function(player_item_interface) {
	var $container = $('<div class="row no-margin"></div>');

	var $archive_indicators = $('<div class="archive-indicators"></div>');

	var indicator_count = 0;
	var artwork_interface = new ArtworkIF(getOneFromCollection("ItemTemplate.js:archive_indicator", artworks, {'_id': player_item_interface.getItemIF().getItemObject().artwork_id}));
	for (var i=0; i<ARCHIVE_CATEGORIES.length; i++) {
		if (player_item_interface.getPlayerIF().hasArchivedArtworkOfCategory(artwork_interface, ARCHIVE_CATEGORIES[i])) {
			$archive_indicators.append($('<i class="check ' + ARCHIVE_CATEGORIES[i] + '-text fa fa-archive"></i>'));
			indicator_count++;
		}
	}

	if (indicator_count > 0) {
		$container.append($archive_indicators);
	}

	var $footer_info = $('<div class="footer-basic-info"></div>');
	var $attribute_area = $('<div class="col-xs-8 no-padding attribute-area"></div>');

	var item_attributes = player_item_interface.getItemIF().getItemObject().attributes;
	for (var i=0; i<item_attributes.unlocked.length; i++) {
		$attribute_area.append(getAttributeHTML(item_attributes.unlocked[i], "unlocked"));
	}

	if (item_attributes.locked.length > 0) {
		$attribute_area.append($('<span class="separator-built">|</span>'));

		for (var i=0; i<item_attributes.locked.length; i++) {
			$attribute_area.append(getAttributeHTML(item_attributes.locked[i], "locked"));
		}
	}

	if (item_attributes.special.length > 0) {
		$attribute_area.append($('<span class="separator-built">|</span>'));

		for (var i=0; i<item_attributes.special.length; i++) {
			$attribute_area.append(getAttributeHTML(item_attributes.special[i], "special"));
		}
	}

	$footer_info.append($attribute_area);

	var $level_area = $('<div class="col-xs-4 no-padding"></div>')
	var show_details = true; //TODO replace with logic
	if (show_details) {
		var item_level = player_item_interface.getItemIF().getLevel();
		var $level_div = ($('<div class="level-area"></div>'));
		var $level_text = ($('<p>lvl ' + item_level + ' </p>'));

		if (player_item_interface.getPlayerItemPermissions().canAffordUpgrade() && player_item_interface.getItemIF().getStatus() != "archived") {
			var $level_up_button = ($('<span class="af-color"><i class="fa fa-arrow-circle-o-up"></i></span>'));
			$level_up_button.on('click', getRerollFunction(player_item_interface))
			$level_text.append($level_up_button);
		}

		$level_div.append($level_text);
		$level_area.append($level_div);
	}
	
	else {
		$level_area.append($('<p>?</p>'));
	}

	$footer_info.append($level_area);
	$container.append($footer_info);

	return $container;
}

getHTMLFromItem = function(player_item_interface) {
	var item_object = player_item_interface.getItemIF().getItemObject();

	var $div_wrapper = $('<div></div>');
	if (player_item_interface.getItemIF().getStatus() == "for_sale") {
		$div_wrapper.append($('<div class="item-price green-text text-shadow">' + getMoneyValue(item_object.values.dealer) + '</div>'));
	}

	var aura_string = item_object.displaced ? "displaced-item" : item_object.artwork_data.rarity + "-item";

	var image_url = getArtworkImageURLFromFilename(item_object.artwork_data.filename, "card", item_object.artwork_data.file_extension); 
	var image_width = item_object.artwork_data.file_extension == "gif" ? "700px" : "280px";
	var $item_html = $('<div data-item_id="' + item_object._id + '" class="card-container ' + aura_string + '" style="background: url(' + image_url + ') center; background-size: ' + image_width + ' 390px"></div>');

	var fullViewFunction = function() {
		if ($('.template-modalTemplate').length == 0) {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "fullViewModal", 
				'modal_data': {
					'item_object': item_object
				}
			}, $('body')[0]);
		}
	}

	
	$item_html.on('click', fullViewFunction);

	var $status_mask = getStatusMaskHTML(player_item_interface);
	if ($status_mask != undefined) {
		$item_html.append($status_mask);
	}

	var $card_info = $('<div class="row no-margin card-info"></div>');

	var $card_header = $('<div class="card-header col-xs-12 ' + getItemSignature(player_item_interface.getItemIF(), false) + '"></div>');
	$card_header.append(getBasicInfoHTML(player_item_interface));
	$card_header.append(getDetailsHTML(player_item_interface));
	$card_header.append(getIndicatorsHTML(player_item_interface));

	$card_info.append($card_header);

	var $card_footer = $('<div class="card-footer col-xs-12 ' + getItemSignature(player_item_interface.getItemIF(), false) + '"></div>');
	$card_footer.append(getFooterHTML(player_item_interface));
	$card_info.append($card_footer);
	$item_html.append($card_info);

	$div_wrapper.append($item_html);

	return $div_wrapper;
}

var getTagFunction = function(player_item_interface) {
	return function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "tagItemModal", 
			'modal_data': {
				'item_data': player_item_interface.getItemIF().getItemObject()
			}
		}, $('body')[0]);
	}
}

var getArchiveFunction = function(player_item_interface) {
	return function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "archiveModal", 
			'modal_data': player_item_interface.getItemIF().getItemObject()
		}, $('body')[0]);
	}
}

var getDeleteFunction = function(player_item_interface) {
	return function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "deleteModal", 
			'modal_data': player_item_interface.getItemIF().getItemObject()
		}, $('body')[0]);
	}
}

var getPermanentFunction = function(player_item_interface, desired_status) {
	return function() {
		Meteor.call('setItemPermanentCollectionStatus' , player_item_interface.getItemIF().getId(), desired_status, function(error) {
			if (error)
				console.log(error.message)

			else {
				//updateItemArray();
			}
		})
	}
}

var getClaimFunction = function(player_item_interface) {
	return function() {
		Meteor.call('claimArtwork', player_item_interface.getItemIF().getId(), function(error) {
			if (error)
				console.log(error.message);

			else {
				updateItemArray();
			}
		});
	}
}

var getSellFunction = function(player_item_interface) {
	if (player_item_interface.getPlayerItemPermissions().canQuickDiscard()) {
		return function() {
			Meteor.call('sellItem', player_item_interface.getItemIF().getId(), function(error) {
				if (error)
					console.log(error.message);

				else {
					updateItemArray();
				}
			});
		}
	}

	else {
		return function() {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "quickSellModal", 
				'modal_data': player_item_interface.getItemIF().getItemObject()
			}, $('body')[0]);
		}
	}
}

var getAuctionFunction = function(player_item_interface) {
	return function() {
		if (player_item_interface.getPlayerItemPermissions().canAuction()) {
			Session.set('selectedItem', player_item_interface.getItemIF().getId());
			Modal.show('createAuctionModal');
		}
	}
}

var getPurchaseFunction = function(player_item_interface) {
	if (player_item_interface.getPlayerIF().getUserObject().profile.settings.quick_purchase) {
		return function() {
			Meteor.call('purchaseItemFromDealer', player_item_interface.getItemIF().getId(), function(error) {
				if (error)
					console.log(error.message);

				else {
					updateItemArray();
				}
			});
		}
	}

	else {
		return function() {
			Session.set('selectedItem', player_item_interface.getItemIF().getId());
			Modal.show('purchaseModal');
		}
	}
}

var getDonateFunction = function(player_item_interface) {
	if (player_item_interface.getPlayerItemPermissions().canQuickDiscard()) {
		return function() {
			Meteor.call('donateItem', player_item_interface.getItemIF().getId(), function(error) {
				if (error)
					console.log(error.message);

				else {
					updateItemArray();
				}
			});
		}
	}

	else {
		return function() {
			Blaze.renderWithData(Template.modalTemplate, {
				'modal_name': "donateModal", 
				'modal_data': player_item_interface.getItemIF().getItemObject()
			}, $('body')[0]);
		}
	}
}

var getRerollFunction = function(player_item_interface) {
	return function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "rerollModal", 
			'modal_data': player_item_interface.getItemIF().getItemObject()
		}, $('body')[0]);
	}
}

var getDeclineFunction = function(player_item_interface) {
	return function() {
		Meteor.call('declineItem', player_item_interface.getItemIF().getId(), function(error) {
			if(error)
				console.log(error.message);

			else {
				updateItemArray();
			}
		})
	}
}

var getDisplayFunction = function(player_item_interface, desired_status) {
	return function() {
		Meteor.call('setItemDisplayStatus' , player_item_interface.getItemIF().getId(), desired_status, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemArray();
				var nested_player_interface = new PlayerIF(player_item_interface.getPlayerIF().getId());
				var all_tutorial_items_displayed = items.find({'owner': nested_player_interface.getId(), 'status': "displayed", 'tutorial_item': true}).count() == items.find({'owner': nested_player_interface.getId(), 'tutorial_item': true}).count();
				if (nested_player_interface.readyForTutorial("outro") && all_tutorial_items_displayed) {
					Meteor.call('changeTutorialStep', true, function(error) {
						if (error) {
							console.log(error)
						}

						else {
							buildTutorialContents();
						}
					})
				}
			}
		})
	}
}

var getForSaleFunction = function(player_item_interface, desired_status) {
	return function() {
		Meteor.call('setForSaleTag' , player_item_interface.getItemIF().getId(), desired_status, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemArray();
				// var item_object = items.findOne(player_item_interface.getItemIF().getId());
				// updateInterfaces(item_object);
				// var container_id = "#item_" + item_object._id;
				// fillItemContainer($(container_id), new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object)));
			}
		})
	}
}

var getRepairingFunction = function(player_item_interface, desired_status) {
	return function() {
		Meteor.call('setItemRepairingStatus' , player_item_interface.getItemIF().getId(), desired_status, function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemArray();
				// var item_object = items.findOne(player_item_interface.getItemIF().getId());
				// updateInterfaces(item_object);
				// var container_id = "#item_" + item_object._id;
				// fillItemContainer($(container_id), new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object)));
			}
		})
	}
}

var getForgeFunction = function(player_item_interface) {
	return function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "forgeModal", 
			'modal_data': player_item_interface.getItemIF().getItemObject()
		}, $('body')[0]);
	}
}

var getIdentifyFunction = function(player_item_interface) {
	return function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "identifyForgeryModal", 
			'modal_data': player_item_interface.getItemIF().getItemObject()
		}, $('body')[0]);
	}
}

var getRedeemFunction = function(player_item_interface) {
	return function() {
		Meteor.call('redeemItem' , player_item_interface.getItemIF().getId(), function(error) {
			if (error)
				console.log(error.message)

			else {
				updateItemArray();
			}
		})
	}
}

var getActionFunction = function(action, player_item_interface) {
	switch(action) {
		case "tag": return getTagFunction(player_item_interface);
		case "archive": return getArchiveFunction(player_item_interface);
		case "delete": return getDeleteFunction(player_item_interface);
		case "permanent": return getPermanentFunction(player_item_interface, true);
		case "unpermanent": return getPermanentFunction(player_item_interface, false);
		case "claim": return getClaimFunction(player_item_interface);
		case "sell": return getSellFunction(player_item_interface);
		case "auction": return getAuctionFunction(player_item_interface);
		case "purchase": return getPurchaseFunction(player_item_interface);
		case "donate": return getDonateFunction(player_item_interface);
		case "reroll": return getRerollFunction(player_item_interface);
		case "decline": return getDeclineFunction(player_item_interface);
		case "display": return getDisplayFunction(player_item_interface, true);
		case "undisplay": return getDisplayFunction(player_item_interface, false);
		case "tag_for_sale": return getForSaleFunction(player_item_interface, true);
		case "untag_for_sale": return getForSaleFunction(player_item_interface, false);
		case "repairing": return getRepairingFunction(player_item_interface, true);
		case "unrepairing": return getRepairingFunction(player_item_interface, false);
		case "forge": return getForgeFunction(player_item_interface);
		case "identify": return getIdentifyFunction(player_item_interface);
		case "redeem": return getRedeemFunction(player_item_interface);
		default: return undefined;
	}
}

getItemActionsHTML = function(player_item_interface) {
	try {
		var item_object = player_item_interface.getItemIF().getItemObject();

		var $button_area = $('<div class="button-area"></div>');

		if (player_item_interface.getItemIF().getStatus() == "archived") {
			var $button_row = $('<p class="button-row archived"></div>');

			var $tag_button = $('<span class="tags enabled"><i class="fa fa-tags"></i></span>');
			$tag_button.on('click', getActionFunction("tag", player_item_interface));
			$button_row.append($tag_button);

			var $archive_button = $('<span class="archive enabled"><i class="fa fa-archive"></i></span>');
			$archive_button.on('click', getActionFunction("archive", player_item_interface));
			$button_row.append($archive_button);

			if (player_item_interface.getPlayerItemPermissions().canSetPermanent()) {
				var $permanent_button = $('<span class="perm-collection inactive"><i class="fa fa-heart"></i></span>');
				$permanent_button.on('click', getActionFunction("permanent", player_item_interface));
				$button_row.append($permanent_button);
			}

			else if (player_item_interface.getPlayerItemPermissions().canUnsetPermanent()) {
				var $permanent_button = $('<span class="perm-collection active af-color"><i class="fa fa-heart"></i></span>');
				$permanent_button.on('click', getActionFunction("unpermanent", player_item_interface));
				$button_row.append($permanent_button);
			}

			var $delete_button = $('<span class="delete enabled"><i class="fa fa-times"></i></span>');
			$delete_button.on('click', getActionFunction("delete", player_item_interface));
			$button_row.append($delete_button);

			$button_area.append($button_row);
		}

		else {
			var $action_button_row = $('<p class="button-row unarchived"></div>');

			if (player_item_interface.getPlayerItemPermissions().canClaim()) {
				var $claim_button = $('<span class="claim enabled"><i class="fa fa-plus"></i></span>');
				$claim_button.on('click', getActionFunction("claim", player_item_interface));
				$action_button_row.append($claim_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canSell()) {
				var $sell_button = $('<span class="quick-sell enabled"><i class="fa fa-usd"></i></span>');
				$sell_button.on('click', getActionFunction("sell", player_item_interface));
				$action_button_row.append($sell_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canAuction()) {
				var $auction_button = $('<span class="auction enabled"><i class="fa fa-gavel"></i></span>');
				$auction_button.on('click', getActionFunction("auction", player_item_interface));
				$action_button_row.append($auction_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canPurchase()) {
				var $purchase_button = $('<span class="purchase enabled"><i class="fa fa-shopping-cart"></i></span>');
				$purchase_button.on('click', getActionFunction("purchase", player_item_interface));
				$action_button_row.append($purchase_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canDonate()) {
				var $donate_button = $('<span class="donate enabled"><i class="fa fa-share-square"></i></span>');
				$donate_button.on('click', getActionFunction("donate", player_item_interface));
				$action_button_row.append($donate_button);
			}

			var $reroll_button = $('<span class="reroll enabled"><i class="fa fa-magic"></i></span>');
			$reroll_button.on('click', getActionFunction("reroll", player_item_interface));
			$action_button_row.append($reroll_button);

			if (player_item_interface.getPlayerItemPermissions().canArchive()) {
				var $archive_button = $('<span class="archive enabled"><i class="fa fa-archive"></i></span>');
				$archive_button.on('click', getActionFunction("archive", player_item_interface));
				$action_button_row.append($archive_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canDecline()) {
				var $decline_button = $('<span class="decline enabled"><i class="fa fa-times"></i></span>');
				$decline_button.on('click', getActionFunction("decline", player_item_interface));
				$action_button_row.append($decline_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canIdentify()) {
				var $identify_button = $('<span class="decline enabled"><i class="fa fa-search"></i></span>');
				$identify_button.on('click', getActionFunction("identify", player_item_interface));
				$action_button_row.append($identify_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canRedeemForgery()) {
				var $redeem_button = $('<span class="redeem enabled"><i class="fa fa-shield"></i></span>');
				$redeem_button.on('click', getActionFunction("redeem", player_item_interface));
				$action_button_row.append($redeem_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canDelete()) {
				var $delete_button = $('<span class="delete enabled"><i class="fa fa-times"></i></span>');
				$delete_button.on('click', getActionFunction("delete", player_item_interface));
				$action_button_row.append($delete_button);
			}

			$button_area.append($action_button_row);

			var $status_button_row = $('<p class="button-row"></div>');

			if (player_item_interface.getPlayerItemPermissions().canDisplay()) {
				var $display_button = $('<span class="display inactive"><i class="fa fa-picture-o"></i></span>');
				$display_button.on('click', getActionFunction("display", player_item_interface));
				$status_button_row.append($display_button);
			}

			else if (player_item_interface.getPlayerItemPermissions().canUndisplay()) {
				var $undisplay_button = $('<span class="display active af-color"><i class="fa fa-picture-o"></i></span>');
				$undisplay_button.on('click', getActionFunction("undisplay", player_item_interface));
				$status_button_row.append($undisplay_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canSetPermanent()) {
				var $permanent_button = $('<span class="perm-collection inactive"><i class="fa fa-heart"></i></span>');
				$permanent_button.on('click', getActionFunction("permanent", player_item_interface));
				$status_button_row.append($permanent_button);
			}

			else if (player_item_interface.getPlayerItemPermissions().canUnsetPermanent()) {
				var $permanent_button = $('<span class="perm-collection active af-color"><i class="fa fa-heart"></i></span>');
				$permanent_button.on('click', getActionFunction("unpermanent", player_item_interface));
				$status_button_row.append($permanent_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canTagForSale()) {
				var $tag_for_sale_button = $('<span class="tag-for-sale inactive"><i class="fa fa-binoculars"></i></span>');
				$tag_for_sale_button.on('click', getActionFunction("tag_for_sale", player_item_interface));
				$status_button_row.append($tag_for_sale_button);
			}

			else if (player_item_interface.getPlayerItemPermissions().canUntagForSale()) {
				var $untag_for_sale_button = $('<span class="tag-for-sale active af-color"><i class="fa fa-binoculars"></i></span>');
				$untag_for_sale_button.on('click', getActionFunction("untag_for_sale", player_item_interface));
				$status_button_row.append($untag_for_sale_button);
			}

			if (player_item_interface.getPlayerItemPermissions().canSetRepairing()) {
				var $repairing_button = $('<span class="repairing inactive"><i class="fa fa-wrench"></i></span>');
				$repairing_button.on('click', getActionFunction("repairing", player_item_interface));
				$status_button_row.append($repairing_button);
			}

			else if (player_item_interface.getPlayerItemPermissions().canUnsetRepairing()) {
				var $repairing_button = $('<span class="repairing active af-color"><i class="fa fa-wrench"></i></span>');
				$repairing_button.on('click', getActionFunction("unrepairing", player_item_interface));
				$status_button_row.append($repairing_button);
			}

			var $tag_button = $('<span class="tags enabled"><i class="fa fa-tags"></i></span>');
			$tag_button.on('click', getActionFunction("tag", player_item_interface));
			$status_button_row.append($tag_button);

			$button_area.append($status_button_row);

		}

		return $button_area;
	}

	catch (error) {
		console.log(error);
	}
}

fillItemContainerByItemId = function(item_id, player_item_interface) {
	var id_string = "#item_" + item_id;
	fillItemContainer($(id_string), player_item_interface);
}

fillItemContainer = function(container, player_item_interface) {
	container.empty();
	var $item = $('<div class="template-itemInfo"></div>');			
	$item.append(getHTMLFromItem(player_item_interface));
	container.append($item);

	var $item_actions = $('<div class="template-itemActions"></div>');
	$item_actions.append(getItemActionsHTML(player_item_interface));
	container.append($item_actions);
	return container;
}
