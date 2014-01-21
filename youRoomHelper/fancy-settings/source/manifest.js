/*!
 * manifest.js (in Fancy Settings)
 * Fancy Settings by Frank Kohlhepp
 * Copyright (c) 2011 - 2012 Frank Kohlhepp
 * https://github.com/frankkohlhepp/fancy-settings
 */
this.manifest = {
    "name": "youRoomHelper",
    "settings": [
        {
            "tab": i18n.get("settings"),
            "group": i18n.get("general"),
            "name": "hideSocialGadget",
            "type": "checkbox",
            "label": i18n.get("desc-hide-social-gadgets")
        },
        {
            "tab": i18n.get("settings"),
            "group": i18n.get("general"),
            "name": "enableShiftEnterPost",
            "type": "checkbox",
            "label": i18n.get("desc-enable-shiftenter-post")
        },
        {
            "tab": i18n.get("settings"),
            "group": i18n.get("general"),
            "name": "commentCheckInterval",
            "type": "slider",
            "label": i18n.get("comment-check-interval") + ":",
            "max": 300,
            "min": 30,
            "def": 60,
            "step": 10,
            "display": true,
            "displayModifier": function(value){
                value = value || 60;
                return value + " " + i18n.get("seconds");
            }
        },
        {
            "tab": i18n.get("settings"),
            "group": i18n.get("meeting_mode"),
            "name": "enableMeetingMode",
            "type": "checkbox",
            "label": i18n.get("desc-enable-meetingmode")
        },
        {
            "tab": i18n.get("settings"),
            "group": i18n.get("meeting_mode"),
            "name": "meetingModeInterval",
            "type": "slider",
            "label": i18n.get("desc-meetingmode-interval") + ":",
            "max": 60,
            "min": 3,
            "step": 1,
            "display": true,
            "displayModifier": function(value){
                value = value || 3;
                return value + " " + i18n.get("seconds");
            }
        }
    ]
};