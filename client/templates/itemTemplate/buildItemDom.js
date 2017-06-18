buildHTMLFromItem = function(item_object) {
	var item_interface = new ItemIF(item_object);
	var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), item_interface);

	var aura_string = item_object.displaced ? "displaced-item" : item_object.artwork_data.rarity + "-item";

	var $item_html = $("<div data-item_id='" + item_object._id + "' class='card-container " + aura_string + "' style='background: url(\"https://s3.amazonaws.com/com.artfunkel.artwork/card_images/monet_san_card.jpg\") center; background-size: 280px 390px'></div>");

	switch(item_object.status) {
		case "displayed":
			var $display_mask = $("<div class='status-mask'></div>");
			var $mask_info_container = &("<div class='mask-info-container'></div>");
			$mask_info_container.append($('<p class="display-details af-color text-shadow">' + getCommaSeparatedValue(player_item_interface.getXPPerHour()) + 'xp/hr.</p>'))
			$mask_info_container.append($('<p class="display-details af-color text-shadow">' + getCommaSeparatedValue(player_item_interface.getXPPerHour()) + 'xp/hr.</p>'))
	}


// 			<div class="status-mask {{#if displayedStatus item_data}}{{else}}hide{{/if}}">
// 				<div class="mask-info-container">
// 					<p><i class="text-shadow fa fa-picture-o"></i></p>
// 					{{#with display_details item_data}}
// 					{{#if earnings_per_hour}}
// 						<p class="display-details">{{time_since_displayed}}</p>
// 						<p class="display-details green-text text-shadow">{{displayAsMoneyValue earnings_per_hour}}/hr.</p>
// 						<p class="display-details af-color text-shadow">{{commaSeparatedValue xp_per_hour}}xp/hr.</p>
// 					{{/if}}
// 					{{/with}}
// 				</div>
// 			</div>
// 			<div class="status-mask {{#if auctionedStatus item_data}}{{else}}hide{{/if}}">
// 				<i class="text-shadow fa fa-gavel"></i>
// 			</div>
// 			<div class="status-mask {{#if repairingStatus item_data}}{{else}}hide{{/if}}">
// 				<div class="mask-info-container">
// 					<p><i class="text-shadow fa fa-wrench {{#if isEqual item_data.condition 1}}green-text{{/if}}"></i></p>
// 					<p class="display-details text-shadow {{#if isEqual item_data.condition 1}}green-text{{/if}}">{{floatToPercentage item_data.condition}}%</p>
// 				</div>
// 			</div>
// 			<div class="status-mask {{#if permanentStatus item_data}}{{else}}hide{{/if}}">
// 				<div class="mask-info-container">
// 					<p><i class="text-shadow fa fa-heart"></i></p>
// 					{{#with permanent_details item_data}}
// 					{{#if xp_per_hour}}
// 						<p class="display-details">{{time_since_displayed}}</p>
// 						<p class="display-details af-color text-shadow">{{commaSeparatedValue xp_per_hour}}xp/hr.</p>
// 					{{/if}}
// 					{{/with}}
// 				</div>
// 			</div>
// 			<div class="row no-margin card-info">
// 				<div class="card-header col-xs-12 {{card_types item_data}}">
// 					<div class="row no-margin">
// 						<div class="header-basic-info">
// 							<p class="item-title work-title">{{#if already_owns item_data}}* {{/if}}{{item_data.artwork_data.title}}</p>
// 							<p>{{item_data.artwork_data.artist}}</p>
// 						</div>
// 					</div>

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