getStatusMaskHTML = function(player_item_interface) {
	var $status_mask = $("<div class='status-mask'></div>");
	var item_object = player_item_interface.getItemIF().getItemObject();

	switch(item_object.status) {
		case "displayed":
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;	
			var $mask_info_container = &("<div class='mask-info-container'></div>");
			$mask_info_container.append($('<p><i class="text-shadow fa fa-picture-o"></i></p>'));
			$mask_info_container.append($('<p class="display-details">' + getDurationString(moment() - moment(time_since_displayed), false, "dhm") + '</p>'));
			$mask_info_container.append($('<p class="display-details greeb-text text-shadow">$' + getCommaSeparatedValue(player_item_interface.getDisplayValuePerHour()) + '/hr.</p>'));
			$mask_info_container.append($('<p class="display-details af-color text-shadow">' + getCommaSeparatedValue(player_item_interface.getXPPerHour()) + 'xp/hr.</p>'));
			$status_mask.append($mask_info_container);
			break;
		case "permanent":
			var time_since_displayed = player_item_interface.getItemIF().getItemObject().time_displayed;
			var $mask_info_container = &("<div class='mask-info-container'></div>");
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
			var $mask_info_container = &("<div class='mask-info-container'></div>");
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
	$header_basic_info.append($('<p>' + player_item_interface.getItemIF().getItemObject().artwork_data.title + '</p>'));

	$container.append($header_basic_info);
	return $container;
}

var getHeaderDetailsHTML = function(player_item_interface) {
	var $container = $('<div class="row no-margin"></div>');
	var $header_details = $('<div class="header-details"></div>');

	$header_details.append($('<p>{{item_data.artwork_data.date}}</p>'));
	$header_details.append(getItemSignatureHTML(player_item_interface.getItemIF()));
	$header_details.append($('<p></p>'))

	//TODO add rest of header details
}

buildHTMLFromItem = function(item_object) {
	var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), item_interface);

	var aura_string = item_object.displaced ? "displaced-item" : item_object.artwork_data.rarity + "-item";

	var $item_html = $("<div data-item_id='" + item_object._id + "' class='card-container " + aura_string + "' style='background: url(\"https://s3.amazonaws.com/com.artfunkel.artwork/card_images/monet_san_card.jpg\") center; background-size: 280px 390px'></div>");

	item_html.append(getStatusMaskHTML(player_item_interface));

	var $card_info = $('<div class="row no-margin card-info"></div>');

	var item_signature = getItemSignature(player_item_interface.getItemIF());
	var $card_header = $('<div class="card-header col-xs-12 ' + item_signature + '"></div>');

	$card_header.append(getBasicInfoHTML(player_item_interface));



// 			<div class="row no-margin card-info">
// 				<div class="card-header col-xs-12 {{card_types item_data}}">

// 					<div class="row no-margin">
// 						<div class="header-details">
// 							<p>{{item_data.artwork_data.date}}</p>
// 							{{> itemSignature item_data=item_data}}
// 							<p>{{item_data.artwork_data.medium}}</p>
// 							<p>{{item_data.artwork_data.height}} x {{item_data.artwork_data.width}}</p>
// 							{{#if showDetails item_data}}
// 							<div class="dynamic-stats">
// 								<p>condition: <span style="color: {{getHTMLColorFromValue item_data.condition}}">%{{floatToPercentage item_data.condition}}</span></p>
// 								<p id="dynamic-value-stat">estimated value: {{displayAsMoneyValue item_data.values.actual}}</p>
// 								<p id="dynamic-roll-count-stat">roll count: {{item_data.roll_count}}</p>
// 							</div>
// 							{{else}}
// 								<p>condition: ?</p>
// 								<p>estimated value: ?</p>
// 								<p>roll count: ?</p>
// 							{{/if}}
// 							<div class="flavor-area">
// 							{{#with unique_attribute_data item_data.active_unique_attribute}}
// 								<p class="flavor-text af-color {{#if ../item_data.permanent}}permanent{{/if}}">"{{flavor_text}}"</p>
// 							{{/with}}
// 							</div>
// 						</div>
// 					</div>
					
// 					<div class="row no-margin indicator-area">
// 						{{#with recommended_archive item_data}}
// 							{{#if displaced_item}}
// 								{{#if upgrade}}
// 									<i class="green-text fa fa-level-up text-shadow"></i>
// 								{{/if}}
// 							{{else}}
// 							<i class="green-text fa fa-archive text-shadow"></i>
// 							{{/if}}
// 						{{/with}}
// 						{{#if isQuestItem item_data.artwork_id}}
// 							<i class="green-text fa fa-flag-checkered text-shadow"></i>
// 						{{/if}}
// 						{{#if isSought item_data.artwork_id}}
// 							<i class="blue-text fa fa-bullhorn text-shadow"></i>
// 						{{/if}}
// 					</div>			
// 				</div>

// 				<div class="card-footer col-xs-12 {{card_types item_data}}">
// 					<div class="row no-margin">
// 						{{#if archive_indicator item_data}}
// 							<div class="archive-indicators">
// 							{{#each archive_indicator item_data}}
// 								<i class="check {{this}}-text fa fa-archive"></i>
// 							{{/each}}
// 							</div>
// 						{{/if}}
// 						<div class="footer-basic-info">
// 							<div class="col-xs-8 no-padding attribute-area">
// 								{{#each sortedAttributes item_data.attributes.unlocked}}
// 									<i data-attribute_description="{{description}}" data-attribute_value="{{value}}" style="color: {{getHTMLColorFromValue value}}" class="{{#if isEqual ../item_data.status 'permanent'}}permanent{{/if}} item-attribute fa {{icon}}"></i>
// 								{{/each}}
// 								{{#if item_data.attributes.locked}}<span class="separator">|</span>{{/if}}
// 								{{#each sortedAttributes item_data.attributes.locked}}
// 									<i data-attribute_description="{{description}}" data-attribute_value="{{value}}" style="color: {{getHTMLColorFromValue value}}" class="{{#if isEqual ../item_data.status 'permanent'}}permanent{{/if}} locked item-attribute fa {{icon}}"></i>
// 								{{/each}}
// 								{{#if item_data.attributes.special}}<span class="separator">|</span>{{/if}}
// 								{{#each sortedAttributes item_data.attributes.special}}
// 									<i data-attribute_description="{{description}}" data-attribute_value="{{value}}" style="color: {{getHTMLColorFromValue value}}" class="{{#if isEqual ../item_data.status 'permanent'}}permanent{{/if}} special item-attribute fa {{icon}}"></i>
// 								{{/each}}
// 							</div>
// 							<div class="col-xs-4 no-padding">
// 								{{#if showDetails item_data}}
// 								<div class="level-area">
// 									<p>lvl {{item_data.level}} {{#if isEqual item_data.status "archived"}}{{else}}{{#if canAffordUpgrade item_data}}<span class="level-indicator af-color"><i class="fa fa-arrow-circle-o-up"></i></span>{{/if}}{{/if}}</p>
// 								</div>
// 								{{else}}
// 									<p>?</p>
// 								{{/if}}
// 							</div>
// 						</div>
// 					</div>
// 				</div>
// 			</div>
// 		</div>

}