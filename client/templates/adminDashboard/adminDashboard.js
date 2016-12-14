var adminDataTracker = new Tracker.Dependency;
var user_tracker = new Tracker.Dependency;
var artwork_mod_tracker = new Tracker.Dependency;
var artist_mod_tracker = new Tracker.Dependency;
var attribute_mod_tracker = new Tracker.Dependency;
var unique_attribute_mod_tracker = new Tracker.Dependency;
var attribute_link_choice_tracker = new Tracker.Dependency;
var graph_data_tracker = new Tracker.Dependency;
var test_result_tracker = new Tracker.Dependency;
var selected_artwork_special_attributes_selected = [];
var selected_artwork_special_attributes_selected_tracker = new Tracker.Dependency;
var special_attribute_unique_attribute_tracker = new Tracker.Dependency;
var special_attribute_unique_attributes = [];
var generate_artwork_errors = [];
var generate_artwork_error_tracker = new Tracker.Dependency;

var selected_artwork = undefined;

var admin_data = undefined;
var graph_data;
var map_data;
var test_results;

var all_users = [];

var updateSelectedSpecialAttributeDOM = function() {
	$wrapper = $('.special-attribute-section');
	$wrapper.empty();
	attributes.find({'active': true}).forEach(function(attribute_object) {
		if (selected_artwork_special_attributes_selected.indexOf(attribute_object._id) != -1) {
			$wrapper.append('<label><input class="special-attribute-select" type="checkbox" id="special-attribute-checkbox" value="' + attribute_object._id + '" checked>' + attribute_object.npc_name + '</label><br>');
		}

		else {
			$wrapper.append('<label><input class="special-attribute-select" type="checkbox" id="special-attribute-checkbox" value="' + attribute_object._id + '">' + attribute_object.npc_name + '</label><br>');
		}
	})
}

var updateUniqueAttributesFromSpecialAttributeSelected = function() {
	special_attribute_unique_attributes = [];
    for (var i=0; i<selected_artwork_special_attributes_selected.length; i++) {
        for (var n=0; n<selected_artwork_special_attributes_selected.length; n++) {
            if (i != n) {
                var unique_attribute = unique_attributes.findOne({'linked_attributes': {$all: [selected_artwork_special_attributes_selected[i], selected_artwork_special_attributes_selected[n]]}});

                if (special_attribute_unique_attributes.indexOf(unique_attribute.code) == -1)
                    special_attribute_unique_attributes.push(unique_attribute.code);
            }
        }
    }

    special_attribute_unique_attribute_tracker.changed();
}

var updateAdminData = function() {
	Meteor.call('getAdminData', function(error, result) {
		if (error)
			console.log(error.message);

		else {
			admin_data = result
			adminDataTracker.changed();
		}
	})
}

var updateUsers = function() {
	Meteor.call('getUsers', function(error, result) {
		if (error)
			console.log(error.message);

		else {
			all_users = result;
			user_tracker.changed();
		}
	})
}

var setAdminData = function(set_id, value) {
	switch(set_id) {
		case 'set_level': 
			Meteor.call('setPlayerLevel', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			});
			break;

		case 'set_xp':
			Meteor.call('setXP', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			})
			break;

		case 'set_daily_drop': 
			Meteor.call('updateDailyDropCount', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			});
			break;

		case 'set_crate_drop': 
			Meteor.call('updateCrateDropCount', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			})
			break;

		case 'set_bank_balance':
			Meteor.call('setBankBalance', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			})
			break;

		case 'set_seasonal':
			var ids_string = value;
			var id_array = ids_string.replace(/ /g , "").split(",");
			Meteor.call('setSeasonal', id_array, function(error) {
				if (error)
					console.log(error.message);
			});    		

		default: return;
	}

	adminDataTracker.changed();
}

var drawRarityGraph = function() {
	graph_data_tracker.depend();
	if (graph_data) {
		try {
			var options = {

			    ///Boolean - Whether grid lines are shown across the chart
			    scaleShowGridLines : true,

			    //String - Colour of the grid lines
			    scaleGridLineColor : "rgba(0,0,0,.05)",

			    //Number - Width of the grid lines
			    scaleGridLineWidth : 1,

			    //Boolean - Whether to show horizontal lines (except X axis)
			    scaleShowHorizontalLines: true,

			    //Boolean - Whether to show vertical lines (except Y axis)
			    scaleShowVerticalLines: true,

			    //Boolean - Whether the line is curved between points
			    bezierCurve : true,

			    //Number - Tension of the bezier curve between points
			    bezierCurveTension : 0.4,

			    //Boolean - Whether to show a dot for each point
			    pointDot : true,

			    //Number - Radius of each point dot in pixels
			    pointDotRadius : 4,

			    //Number - Pixel width of point dot stroke
			    pointDotStrokeWidth : 1,

			    //Number - amount extra to add to the radius to cater for hit detection outside the drawn point
			    pointHitDetectionRadius : 20,

			    //Boolean - Whether to show a stroke for datasets
			    datasetStroke : true,

			    //Number - Pixel width of dataset stroke
			    datasetStrokeWidth : 2,

			    //Boolean - Whether to fill the dataset with a colour
			    datasetFill : true,

			    //String - A legend template
			    legendTemplate : "<ul class=\"<%=name.toLowerCase()%>-legend\"><% for (var i=0; i<datasets.length; i++){%><li><span style=\"background-color:<%=datasets[i].strokeColor%>\"></span><%if(datasets[i].label){%><%=datasets[i].label%><%}%></li><%}%></ul>"

			};


			var data = {
			    labels: ["0", "10", "20", "30", "40", "50"],
			    datasets: [
			        {
			            label: "common drops",
			            fillColor: "rgba(0,255,0,0)",
			            strokeColor: "rgba(0,255,0,1)",
			            pointColor: "rgba(0,255,0,.5)",
			            pointStrokeColor: "rgba(0,255,0,1)",
			            pointHighlightFill: "#fff",
			            pointHighlightStroke: "rgba(0,255,0,1)",
			            data: graph_data.common
			        },
			        {
			            label: "uncommon drops",
			            fillColor: "rgba(0,0,255,0)",
			            strokeColor: "rgba(0,0,255,1)",
			            pointColor: "rgba(0,0,255,.5)",
			            pointStrokeColor: "rgba(0,0,255,1)",
			            pointHighlightFill: "#fff",
			            pointHighlightStroke: "rgba(0,0,255,1)",
			            data: graph_data.uncommon
			        },
			        {
			            label: "rare drops",
			            fillColor: "rgba(255,255,0,0)",
			            strokeColor: "rgba(255,255,0,1)",
			            pointColor: "rgba(255,255,0,.5)",
			            pointStrokeColor: "rgba(255,255,0,1)",
			            pointHighlightFill: "#fff",
			            pointHighlightStroke: "rgba(255,255,0,1)",
			            data: graph_data.rare
			        },
			        {
			            label: "legendary drops",
			            fillColor: "rgba(255,150,0,0)",
			            strokeColor: "rgba(255,150,0,1)",
			            pointColor: "rgba(255,150,0,.5)",
			            pointStrokeColor: "rgba(255,150,0,1)",
			            pointHighlightFill: "#fff",
			            pointHighlightStroke: "rgba(255,150,0,1)",
			            data: graph_data.legendary
			        },
			        {
			            label: "masterpiece drops",
			            fillColor: "rgba(150,255,255,0)",
			            strokeColor: "rgba(150,255,255,1)",
			            pointColor: "rgba(150,255,255,.5)",
			            pointStrokeColor: "rgba(150,255,255,1)",
			            pointHighlightFill: "#fff",
			            pointHighlightStroke: "rgba(150,255,255,1)",
			            data: graph_data.masterpiece
			        }
			    ]
			};

			var canvas = document.getElementById("drop-chart");
			var ctx = canvas.getContext("2d");
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			var myLineChart = new Chart(ctx).Line(data, options);	
		}

		catch(error) {
			console.log(error.message);
		}
	}
}

Template.adminTools.events({
	'click #reset-daily' : function(element) {
		Meteor.call('resetDailyDrop', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click #new-seasonals' : function(element) {
		var seasonal_count = 1;
		var id_array = [];
		for (var i=0; i < seasonal_count; i++) {
			var selector = {
				'._id': {$nin: id_array}, 
				'rarity': {
					$in: ["legendary", "masterpiece"]
				}
			};

			var artwork_object = artworks.findOne(selector, {skip: Math.floor(Math.random() * artworks.find(selector).count())});

			if (artwork_object)
				id_array.push(artwork_object._id);
		}

		Meteor.call('setSeasonal', id_array, function(error) {
			if (error)
				console.log(error.message);

			else updateAdminData();
		});
	},

	'click #generate-for-sale' : function(element) {
		Meteor.call('generateForSale', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click #level-up' : function(element) {
		Meteor.call('levelUp', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click #generate-npc' : function(element) {
		var attribute_id = $('.npc-selector').val();
		Meteor.call('generateNPC', attribute_id, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .text-field' : function(element) {
		var target = $(element.target);
		var current = target.html();
		var id = $(element.target).attr('id');
		//target.replaceWith('<input id="' + id + '" class="set-field" value="' + current + '"></input>');
		//target.css('display', "none");
		//target.closest('.set-container').find('.set-field').css('display', "block");
	},

	'blur .set-field' : function(element) {
		var target = $(element.target);
		var value = target.val();
		var id = target.attr('id');
		var set_id = target.closest('.set-container').data().set_id;
		//target.replaceWith('<p id="' + id + '" class="text-field">' + value + '</p>');
		//target.css('display', "none");
		//target.closest('.set-container').find('.text-field').css('display', "block");

		setAdminData(set_id, value);
	},

	'keydown .set-field' : function(element) {
        if (element.keyCode == 13) {
			var target = $(element.target);
			var value = target.val();
			var id = $(element.target).attr('id');
			var set_id = target.closest('.set-container').data().set_id;
			//target.replaceWith('<p id="' + id + '" class="text-field">' + value + '</p>');
			// target.css('display', "none");
			// target.closest('.set-container').find('.text-field').css('display', "block");

			setAdminData(set_id, value);
        }
    },

    'click #generate-item' : function(element) {
    	var user_id = $('.user-selector').val();
    	var artwork_id = $('#generate-artwork-id').val();
    	var condition = $('#condition').val() == "" ? Number(Math.random().toFixed(2)) : Number($('#condition').val()) / 100;
    	var xp_rating = $('#xp-rating').val() == "" ? Number(Math.random().toFixed(2)) : Number($('#xp-rating').val()) / 100;
    	var foil_chance = $('.type-selector').val() == "foil" ? 1 : .01;
    	var misprint_chance = $('.misprint-selector').val() == "true" ? 1 : .0001;
    	var seasonal = $('.type-selector').val() == "seasonal";
    	var lottery = isNaN($('.type-selector').val()) ? 0 : Number($('.type-selector').val());
    	var original = $('.type-selector').val() == "original";
    	var vintage = $('.vintage-selector').val() == "true";

    	Meteor.call('generateItemFromArtworkID', user_id, artwork_id, condition, xp_rating, foil_chance, seasonal, Number(lottery), original, vintage, misprint_chance, function(error, result) {
    		if (error)
    			console.log(error.message);

    		if (result === undefined)
    			console.log("an error has occurred");
    	});
    },

    'click #generate-random-item' : function(element) {
    	if (selected_artwork == undefined)
    		return;

    	Meteor.call('generateRandomItemFromArtworkID', Meteor.userId(), selected_artwork._id, function(error, result) {
    		if (error)
    			console.log(error.message);

    		if (result === undefined)
    			console.log("an error has occurred");
    	});
    },

    'click #generate-unique' : function(element) {
    	var artwork_id = $(element.target).data().artwork_id;

    	Meteor.call('generateRandomItemFromArtworkID', Meteor.userId(), artwork_id, function(error, result) {
    		if (error)
    			console.log(error.message);

    		if (result === undefined)
    			console.log("an error has occurred");
    	});
    },

    'click #modify-profiles' : function(element) {
    	var field_name = $('#profile-add-field').val();
    	var entered_value = $('#profile-add-value').val();
    	var value;

    	if (field_name === "" || field_name.indexOf(" ") != -1)
    		console.log("invalid request");

    	if (typeof(entered_value) == "string" && entered_value.length == 0) {
    		if (confirm("warning: This action could potentially erase data from the player database. Are you sure you want to do this?"))
    			value = "";

    		else return;
    	}

    	else if (entered_value === "false")
    		value = false;

    	else if (entered_value === "true")
    		value = true;

    	else if (isNaN(entered_value)) 
    		value = entered_value;

    	else value = Number(entered_value);
    	
    	Meteor.call('updateProfiles', field_name, value, function(error) {
    		if (error)
    			console.log(error.message);
    	})
    },

    'click #alert-users' : function(element) {
    	var message = $('#alert-users-text')[0].value;
    	Meteor.call('alertAllUsers', message, function(error) {
    		if (error)
    			console.log(error.message);
    	})
    },

    'click .attribute-toggle' : function(element) {
    	var attribute_id = $(element.target).closest('.attribute-toggle').data().attribute_id;
    	Meteor.call('toggleAttributeStatus', attribute_id, function(error) {
    		if (error)
    			console.log(error);
    	})
    },

    'click #generate-link' : function() {
    	var attribute_data = attributes.find().fetch();
		var data = "text/json;charset=utf-8," + "var downloaded_attribute_data = " + encodeURIComponent(JSON.stringify(attribute_data)) + "; ";

		Meteor.call('generateDBString', function(error, result) {
			if (error)
				console.log(error.message);

			else {
				var download_link = $('<a>download databases</a>');
				download_link.attr("href", 'data:' + result);
				download_link.attr("download", 'data.json');

				$('#download-area').append(download_link);
			}
		})
    },

    'click #print-misprints' : function() {
    	Meteor.call('getMisprints', function(error, result) {
    		if (error)
    			console.log(error.message);

    		else {
    			console.log(result);
    		}
    	})
    },

    'change .artwork-selector' : function() {
    	special_attribute_unique_attributes = [];
    	selected_artwork_special_attributes_selected = [];

    	var artwork_object = artworks.findOne($('.artwork-selector').val());
		if (artwork_object) {
			selected_artwork_special_attributes_selected = artwork_object.special_attributes ? artwork_object.special_attributes : [];
			updateSelectedSpecialAttributeDOM();
		}

		selected_artwork = artwork_object;
		updateUniqueAttributesFromSpecialAttributeSelected();
		artwork_mod_tracker.changed();
    },

    'change .artist-mod-selector' : function() {
    	artist_mod_tracker.changed();
    },

    'change .attribute-mod-selector' : function() {
    	attribute_mod_tracker.changed();
    },

    'change .unique-attribute-mod-selector' : function() {
    	unique_attribute_mod_tracker.changed();
    },

    'change .unique-link-attribute-selector' : function() {
    	attribute_link_choice_tracker.changed();
    },

	'click #update-artwork': function(element) {
		$(document.activeElement).blur();

		var artwork_id = $('.artwork-selector').val();

		if (artwork_id == "unselected")
			return;

		var artwork_object = generateArtworkObject();

		generate_artwork_error_tracker.changed();
		if (artwork_object == undefined)
			return;

		var artwork_keys = Object.keys(artwork_object);

		if (artwork_id == "new artwork") {
			for (var i=0; i<artwork_keys.length; i++) {
				var key = artwork_keys[i];
				if (artwork_object[key] === "")
					return;
			}

			Meteor.call('addNewArtwork', artwork_object, function(error, result) {
				if (error)
					console.log(error.message);

				else {
					$('.artwork-selector').append('<option value="' + result + '">' + artwork_object.artist + ' - ' + artwork_object.title + '</option>');
					$('.artwork-selector').val(result);
					artwork_mod_tracker.changed();
				}
			});
		}

		else {
			var existing_artwork_object = (artworks.findOne(artwork_id));

			for (var i=0; i<artwork_keys.length; i++) {
				var key = artwork_keys[i];
				if (artwork_object[key] === "")
					artwork_object[key] = existing_artwork_object[key];
			}

			Meteor.call('updateArtworkData', artwork_id, artwork_object, function(error, result) {
				if (error)
					console.log(error.message);

				else artwork_mod_tracker.changed();
			});
		}
	},

	'click #update-artist': function() {
		$(document.activeElement).blur();

		var artist_id = $('.artist-mod-selector').val();

		if (artist_id == "unselected")
			return;

		var artist_object = generateArtistObject();
		var artist_keys = Object.keys(artist_object);

		if (artist_id == "new artist") {
			for (var i=0; i<artist_keys.length; i++) {
				var key = artist_keys[i];
				if (artist_object[key] === "")
					return;
			}

			Meteor.call('addNewArtist', artist_object, function(error, result) {
				if (error)
					console.log(error.message);

				else {
					$('.artist-mod-selector').append('<option value="' + result + '">' + artist_object.artist_name + '</option>');
					$('.artist-mod-selector').val(result);
					artist_mod_tracker.changed();
				}
			});
		}

		else {
			var existing_artist_object = (artists.findOne(artist_id));

			for (var i=0; i<artist_keys.length; i++) {
				var key = artist_keys[i];
				if (artist_object[key] === "")
					artist_object[key] = existing_artist_object[key];
			}

			Meteor.call('updateArtistData', artist_id, artist_object, function(error, result) {
				if (error)
					console.log(error.message);

				else artist_mod_tracker.changed();
			});
		}
	},

	'click #update-attribute': function() {
		$(document.activeElement).blur();

		var attribute_id = $('.attribute-mod-selector').val();

		if (attribute_id == "unselected")
			return;

		var attribute_object = generateAttributeObject();
		var attribute_keys = Object.keys(attribute_object);

		if (attribute_id == "new attribute") {
			for (var i=0; i<attribute_keys.length; i++) {
				var key = attribute_keys[i];
				if (attribute_object[key] === "")
					return;
			}

			Meteor.call('addNewAttribute', attribute_object, function(error, result) {
				if (error)
					console.log(error.message);

				else {
					$('.attribute-mod-selector').append('<option value="' + result + '">' + attribute_object.description + '</option>');
					$('.attribute-mod-selector').val(result);
					attribute_mod_tracker.changed();
				}
			});
		}

		else {
			var existing_attribute_object = (attributes.findOne(attribute_id));

			for (var i=0; i<attribute_keys.length; i++) {
				var key = attribute_keys[i];
				if (attribute_object[key] === "")
					attribute_object[key] = existing_attribute_object[key];
			}

			Meteor.call('updateAttributeData', attribute_id, attribute_object, function(error, result) {
				if (error)
					console.log(error.message);

				else attribute_mod_tracker.changed();
			});
		}
	},

	'click #update-unique-attribute': function() {
		$(document.activeElement).blur();

		var unique_attribute_id = $('.unique-attribute-mod-selector').val();

		if (unique_attribute_id == "unselected")
			return;

		var unique_attribute_object = generateUniqueAttributeObject();
		var unique_attribute_keys = Object.keys(unique_attribute_object);

		if (unique_attribute_id == "new unique attribute") {
			for (var i=0; i<unique_attribute_keys.length; i++) {
				var key = unique_attribute_keys[i];
				if (unique_attribute_object[key] === "")
					return;
			}

			Meteor.call('addNewUniqueAttribute', unique_attribute_object, function(error, result) {
				if (error)
					console.log(error.message);

				else if (result) {
					// $('.unique-attribute-mod-selector').append('<option value="' + result + '">' + unique_attribute_object.title + '</option>');
					// $('.unique-attribute-mod-selector').val(result);
					unique_attribute_mod_tracker.changed();
					$('.unique-attribute-mod-selector').val(result);
				}
			});g
		}

		else {
			var existing_unique_attribute_object = (unique_attributes.findOne(unique_attribute_id));

			for (var i=0; i<unique_attribute_keys.length; i++) {
				var key = unique_attribute_keys[i];
				if (unique_attribute_object[key] === "")
					unique_attribute_object[key] = existing_unique_attribute_object[key];
			}

			Meteor.call('updateUniqueAttributeData', unique_attribute_id, unique_attribute_object, function(error, result) {
				if (error)
					console.log(error.message);

				else unique_attribute_mod_tracker.changed();
			});
		}
	},

	'click #save-rarity-map': function() {
		var rarity_map = generateRarityMap();
		Meteor.call('updateSmartMap', rarity_map, function(error, result) {
			if (error)
				console.log(error.message);

			else {
				graph_data = result.graph_data;
				map_data = result.map_data;
				drawRarityGraph();
				graph_data_tracker.changed();
			}
		})
	},

	'click #test-rarity-map': function() {
		var player_level = $('.test-map-level').val();

		if (isNaN(player_level))
			return;

		Meteor.call('getTestResults', Number(player_level), function(error, result) {
			if (error) 
				console.log(error.message)

			else {
				test_results = result;
				test_result_tracker.changed();
			}
		})
	},

	'click #give-quest-items': function() {
		Meteor.call('giveQuestItems', function(error) {
			if (error)
				console.log(error.message)
		})
	},

	'change .special-attribute-select': function(event) {
		var checked = $(event.target)[0].checked;
		var attribute_id = $(event.target).val();
		if (checked && selected_artwork_special_attributes_selected.indexOf(attribute_id) == -1) {
			selected_artwork_special_attributes_selected.push($(event.target).val());
		}

		if (!checked && selected_artwork_special_attributes_selected.indexOf(attribute_id) != -1) {
			selected_artwork_special_attributes_selected.splice(selected_artwork_special_attributes_selected.indexOf(attribute_id), 1);
		}

		updateUniqueAttributesFromSpecialAttributeSelected();
	}
});

var generateRarityMap = function() {
	var rarity_map = {};
	
	for (var i=0; i<$('.rarity-map-value-input').length; i++) {
		var current_cell = $('.rarity-map-value-input:eq(' + i + ')');
		var level = Number(current_cell.data().level);
		var rarity = current_cell.closest('.rarity-row').data().rarity;
		
		if (rarity_map[level] == undefined)
			rarity_map[level] = {};

		rarity_map[level][rarity] = Number(current_cell.val());
	}
	
	return rarity_map;
}

var generateArtworkObject = function() {
	var artist_object = artists.findOne($('#artwork-mod-container').find('.artwork-mod-artist-selector').val());

	generate_artwork_errors = [];
	var specified_rarity = $('#artwork-mod-container').find('.rarity-selector').val();

	var special_attributes_expected;

	switch(specified_rarity) {
		case "rare": special_attributes_expected = 1; break;
		case "legendary": special_attributes_expected = 2; break;
		case "masterpiece": special_attributes_expected = 3; break;
		default: special_attributes_expected = 0;
	}

	if (selected_artwork_special_attributes_selected.length != special_attributes_expected) {
		generate_artwork_errors.push(specified_rarity + " artworks require " + special_attributes_expected + " special attributes");
		return undefined;
	}

	var artwork_object = {
		'artist': artist_object.artist_name,
		'artist_id': artist_object._id,
		'date': Number($('#artwork-mod-date').val()),
		'filename': $('#artwork-mod-filename').val(),
		'genre': $('#artwork-mod-genre').val(),
		'height': Number($('#artwork-mod-height').val()),
		'medium': $('#artwork-mod-medium').val(),
		'title': $('#artwork-mod-title').val(),
		'value_scale': $('#artwork-mod-value-scale').val() == "" ? Number(Math.random().toFixed(2)) : Number($('#artwork-mod-value-scale').val()),
		'width': Number($('#artwork-mod-width').val()),		
		'nsfw': $('#artwork-mod-container').find('.nsfw-selector').val() == "true" ? true : false,
		'rarity': specified_rarity,
		'rarity_value': rarityValueFromString($('#artwork-mod-container').find('.rarity-selector').val()),
		'active': $('#artwork-mod-container').find('.active-selector').val() == "true" ? true : false,
		'special_attributes': selected_artwork_special_attributes_selected,
		'unique_attributes': special_attribute_unique_attributes
	}

	return artwork_object;
}

var generateArtistObject = function() {
	var artist_object = {
		'artist_name': $('#artist-mod-name').val(),
		'date_of_birth': $('#artist-mod-date-of-birth').val(),
		'date_of_death': $('#artist-mod-date-of-death').val(),
	}

	return artist_object;
}

var generateAttributeObject = function() {
	var attribute_object = {
		'title': $('#attribute-mod-title').val(),
		'description': $('#attribute-mod-description').val(),
		'icon': $('#attribute-mod-icon').val(),
		'npc_name': $('#attribute-mod-npc-name').val(),
		'active': $('#attribute-mod-container').find('.attribute-active-selector').val() == "true" ? true : false,
	}

	return attribute_object;
}

var generateUniqueAttributeObject = function() {
	var selected_attribute_links = [];
	var attribute_link_count = $('.unique-link-attribute-selector').length;
	for (var i=0; i<attribute_link_count; i++) {
		selected_attribute_links.push($('.unique-link-attribute-selector:eq(' + i + ')').val());
	}

	var unique_attribute_object = {
		'title': $('#unique-attribute-mod-title').val(),
		'description': $('#unique-attribute-mod-description').val(),
		'flavor_text': $('#unique-attribute-mod-flavor-text').val(),
		'code': $('#unique-attribute-mod-code').val(),
		'active': $('#unique-attribute-mod-container').find('.unique-attribute-active-selector').val() == "true" ? true : false,
		'linked_attributes': selected_attribute_links
	}

	return unique_attribute_object;
}

Template.adminTools.helpers({
	'adminData' : function() {
		adminDataTracker.depend();

		if (admin_data == undefined)
			updateAdminData();

		else return admin_data;
	},

	'updateChart': function() {
		setTimeout(function() {
			Meteor.call('updateSmartMap', undefined, function(error, result) {
				if (error)
					console.log(error.message);

				else {
					graph_data = result.graph_data;
					map_data = result.map_data;
					drawRarityGraph();
					graph_data_tracker.changed();
				}
			})
		}, 3000);		
	},

	'artwork_rarities': function() {
		return artwork_rarities;
	},

	'current_map': function() {
		graph_data_tracker.depend();
		if (map_data)
			return JSON.stringify(map_data);

		else return undefined;
	},

	'calcPercentage': function(drops) {
		return "%" + ((drops / 10000) * 100).toFixed(2);
	},

	'increment': function(rarity) {
		graph_data_tracker.depend();
		if (map_data) {
			var increment_array = [];
			for (var i=0; i<51; i += 10) {
				increment_array.push({
					'level': i,
					'value': map_data[i][rarity]
				})
			}
			return increment_array;
		}
		
		else return undefined;
	},

	'test_results': function() {
		test_result_tracker.depend();
		if (test_results)
			return test_results;

		else {
			Meteor.call('getTestResults', 50, function(error, result) {
				if (error) 
					console.log(error.message)

				else {
					test_results = result;
					test_result_tracker.changed();
				}
			})
		}
	},

	'attribute' : function() {
		return attributes.find();
	},

	'selectorChoice' : function(locked_attribute_ids) {
		return attributes.find({'_id': {$nin: locked_attribute_ids}, 'active': true});
	},

	'legendary_found' : function() {
		return artworks.find({'rarity': {$in: ["masterpiece", "legendary"]}});
	},

	'npcName' : function(attribute_id) {
		return attributes.findOne(attribute_id).npc_name;
	},

	'npc' : function() {
		return attributes.find({'active': true});
	},

	'user' : function() {
		user_tracker.depend();

		if (all_users.length == 0) {
			updateUsers();
			return [];
		}

		else return all_users;
	},

	'current_user' : function() {
		return Meteor.user().profile.screen_name;
	},

	'current_id' : function() {
		return Meteor.userId();
	},

	'artwork_unique_attribute': function() {
		special_attribute_unique_attribute_tracker.depend();
		return special_attribute_unique_attributes;
	},

	'selected_artwork' : function() {
		artwork_mod_tracker.depend();
		return selected_artwork;
	},

	'generate_artwork_error': function() {
		generate_artwork_error_tracker.depend();
		return generate_artwork_errors;
	},

	'selected_artist' : function() {
		artist_mod_tracker.depend();
		return artists.findOne($('.artist-mod-selector').val());
	},

	'selected_attribute' : function() {
		attribute_mod_tracker.depend();
		return attributes.findOne($('.attribute-mod-selector').val());
	},

	'selected_unique_attribute' : function() {
		unique_attribute_mod_tracker.depend();
		return unique_attributes.findOne($('.unique-attribute-mod-selector').val());
	},

	'artwork' : function() {
		return artworks.find({}, {sort: {'artist': 1}});
	},

	'artists' : function() {
		return artists.find({}, {sort: {'artist_name': 1}});
	},

	'attributes': function() {
		return attributes.find({}, {sort: {'description': 1}});
	},

	'unique_attributes': function() {
		return unique_attributes.find({}, {sort: {'title': 1}});
	},

	'imageSize' : function(width, height) {
		var max_width = 500;
		var max_height = 500;

		var original_ratio = width / height;

		var height_when_width_maxed = max_width / original_ratio;

		if (height_when_width_maxed > max_height) {
			return {
				'image_width': Math.floor(original_ratio * max_height),
				'image_height': max_height
			}
		}

		else return {
			'image_width': max_width,
			'image_height': max_width / original_ratio
		} 
	},

	'rarity_choice' : function(current_rarity) {
		var rarities = ["common", "uncommon", "rare", "legendary", "masterpiece"];
		if (rarities.indexOf(current_rarity) != -1)
			rarities.splice(rarities.indexOf(current_rarity), 1);

		return rarities;
	},

	'artist_choice' : function(current_artist_id) {
		return artists.find({'_id': {$ne: current_artist_id}}, {sort: {'artist_name': 1}});
	},

	'lottery': function() {
		var max_lottery_level = 10;

		var lottery_values = [];

		for (var i=0; i<max_lottery_level; i++) {
			lottery_values.push(i + 1);
		}

		return lottery_values;
	},

	'attributeLinkSelector' : function(linked_attributes) {
		return linked_attributes ? linked_attributes : ["unselected", "unselected"];
	},

	'attributeLinkDescription' : function(attribute_id) {
		attribute_mod_tracker.depend();
		var attribute_object = attributes.findOne(attribute_id);
		return attribute_object ? attribute_object.description : "-- select --";
	},

	'attributeLinkChoice' : function(attribute_id) {
		return attributes.find({'_id': {$ne: attribute_id}, 'active': true});
	},

	'unique_legendary' : function() {
		unique_attribute_mod_tracker.depend();

		var unique_attribute_object = unique_attributes.findOne($('.unique-attribute-mod-selector').val());

		if (unique_attribute_object)
			return artworks.find({'locked_attributes': {$all : unique_attribute_object.linked_attributes}});

		else return [];
	}
})

Template.adminTools.rendered = function() {
	selected_artwork = undefined;
	special_attribute_unique_attributes = [];
	selected_artwork_special_attributes_selected = [];
	generate_artwork_errors = [];
	updateAdminData();
}
