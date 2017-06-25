getStatusMaskHTML = function(player_item_interface) {
	var $status_mask = $("<div class='status-mask'></div>");
	var item_object = player_item_interface.getItemIF().getItemObject();

	switch(item_object.status) {
		case "displayed":
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;	
			var $mask_info_container = $("<div class='mask-info-container'></div>");
			$mask_info_container.append($('<p><i class="text-shadow fa fa-picture-o"></i></p>'));
			$mask_info_container.append($('<p class="display-details">' + getDurationString(moment() - moment(time_since_displayed), false, "dhm") + '</p>'));
			$mask_info_container.append($('<p class="display-details green-text text-shadow">$' + getCommaSeparatedValue(player_item_interface.getDisplayValuePerHour()) + '/hr.</p>'));
			$mask_info_container.append($('<p class="display-details af-color text-shadow">' + getCommaSeparatedValue(player_item_interface.getXPPerHour()) + 'xp/hr.</p>'));
			$status_mask.append($mask_info_container);
			break;
		case "permanent":
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
			var $mask_info_container = $("<div class='mask-info-container'></div>");
			$mask_info_container.append($('<p><i class="text-shadow fa fa-heart"></i></p>'));
			$mask_info_container.append($('<p class="display-details">' + getDurationString(moment() - moment(time_since_displayed), false, "dhm") + '</p>'));
			$mask_info_container.append($('<p class="display-details af-color text-shadow">' + getCommaSeparatedValue(player_item_interface.getXPPerHour()) + 'xp/hr.</p>'));
			$status_mask.append($mask_info_container);
			break;
		case "auctioned":
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
			$status_mask.append($('<i class="text-shadow fa fa-gavel"></i>'));
			break;
		case "repairing":
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
			var $mask_info_container = $("<div class='mask-info-container'></div>");
			if (item_object.condition < 1) {
				$mask_info_container.append($('<p><i class="text-shadow fa fa-wrench green-text"></i></p>'));
				$mask_info_container.append($('<p class="display-details green-text text-shadow">' + Math.floor(item_object.condition * 100) + '%</p>'));
			}

			else {
				$mask_info_container.append($('<p><i class="text-shadow fa fa-wrench"></i></p>'));
				$mask_info_container.append($('<p class="display-details text-shadow">' + Math.floor(item_object.condition * 100) + '%</p>'));
			}

			$status_mask.append($mask_info_container);
			break;
		default: break;
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
	}

	else {
		$item_specs.append($('<p>condition: ?</p>'));
		$item_specs.append($('<p>estimated value: ?</p>'));
		$item_specs.append($('<p>roll count: ?</p>'));
	}
	$header_details.append($item_specs);

	var rarity = player_item_interface.getItemIF().getRarity();
	if (rarity == "legendary" || rarity == "masterpeice") {
		var $flavor_area = $('<div class="flavor-area"></div>');
		var unique_flavor = unique_attributes.findOne(player_item_interface.getItemIF().getItemObject().active_unique_attribute).flavor_text;
		$flavor_area.append($('<p class="flavor-text af-color">"' + unique_flavor + '"</p>'));
		$header_details.append($flavor_area);
	}

	$container.append($header_details);
	return $container;

	//TODO add rest of header details
}

var getIndicatorsHTML = function(player_item_interface) {
	var $container = $('<div class="row no-margin indicator-area"></div>');
	var recommended_status = player_item_interface.getRecommendedStatus();
	if (recommended_status.displaced_item) {
		if (recommended_status.updgrade) {
			$container.append($('<i class="green-text fa fa-level-up text-shadow"></i>'));
		}
	}

	else {
		$container.append($('<i class="green-text fa fa-archive text-shadow"></i>'));
	}

	if (player_item_interface.isQuestTarget()) {
		$container.append($('<i class="green-text fa fa-flag-checkered text-shadow"></i>'));
	}

	if (player_item_interface.isSought()) {
		$container.append($('<i class="blue-text fa fa-bullhorn text-shadow"></i>'));
	}

	return $container;
}

var getAttributeHTML = function(attribute, attribute_type) {
	return $('<i data-attribute_description="' + attribute.description + '" data-attribute_value="' + attribute.value + '" style="color: ' + getHTMLColorFromValue(attribute.value) + '" class="' + attribute_type + '-attribute item-attribute fa ' + attribute.icon + '"></i>');
}

var getFooterHTML = function(player_item_interface) {
	var $container = $('<div class="row no-margin"></div>');

	var $archive_indicators = $('<div class="archive-indicators"></div>');
	var archive_categories = player_item_interface.getItemIF().getArchiveCategories();
	for (var i=0; i<archive_categories.length; i++) {
		var category = archive_categories[i];
		$archive_indicators.append($('<i class="check ' + category + '-text fa fa-archive"></i>'));
	}
	$container.append($archive_indicators);

	var $footer_info = $('<div class="footer-basic-info"></div>');
	var $attribute_area = $('<div class="col-xs-8 no-padding attribute-area"></div>');

	var item_attributes = player_item_interface.getItemIF().getItemObject().attributes;
	for (var i=0; i<item_attributes.unlocked.length; i++) {
		$attribute_area.append(getAttributeHTML(item_attributes.unlocked[i], "unlocked"));
	}

	if (item_attributes.locked.length > 0) {
		$attribute_area.append($('<span class="separator">|</span>'));

		for (var i=0; i<item_attributes.locked.length; i++) {
			$attribute_area.append(getAttributeHTML(item_attributes.locked[i], "locked"));
		}
	}

	if (item_attributes.special.length > 0) {
		$attribute_area.append($('<span class="separator">|</span>'));

		for (var i=0; i<item_attributes.special.length; i++) {
			$attribute_area.append(getAttributeHTML(item_attributes.special[i], "special"));
		}
	}

	$footer_info.append($attribute_area);

	var $level_area = $('<div class="col-xs-4 no-padding"></div>')
	var show_details = true; //TODO replace with logic
	if (show_details) {
		var item_level = player_item_interface.getItemIF().getLevel();
		var upgrade_html_string = player_item_interface.getPlayerItemPermissions().canAffordUpgrade() && player_item_interface.getItemIF().getStatus() != "archived" ? '<span class="level-indicator af-color"><i class="fa fa-arrow-circle-o-up"></i></span>' : "";
		$level_area.append($('<div class="level-area"><p>lvl ' + item_level + ' ' + upgrade_html_string + '</p></div>'));
	}
	
	else {
		$level_area.append($('<p>?</p>'));
	}

	$footer_info.append($level_area);
	$container.append($footer_info);

	return $container;
}

getHTMLFromItem = function(item_object) {
	var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_object));

	var aura_string = item_object.displaced ? "displaced-item" : item_object.artwork_data.rarity + "-item";

	var $item_html = $("<div data-item_id='" + item_object._id + "' class='card-container " + aura_string + "' style='background: url(\"https://s3.amazonaws.com/com.artfunkel.artwork/card_images/monet_san_card.jpg\") center; background-size: 280px 390px'></div>");

	$item_html.append(getStatusMaskHTML(player_item_interface));

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

	return $item_html;
}