#define TWOPI 6.28318530718
#define PI 3.141592653
#define AA 0.001
#define SIXTY_DEGREES 1.0471975512
#define IMAGE_PALETTE_SIZE 8

#define CYAN vec3(0., 1., 1.)
#define MAGENTA vec3(1., 0., 1.)
#define YELLOW vec3(1., 1., 0.)
#define RED vec3(1., 0., 0.)
#define GREEN vec3(0., 1., 0.)
#define BLUE vec3(0., 0., 1.)
#define ORANGE vec3(1., .75, .25)
#define PINK vec3(1., .25, .75)
#define WHITE vec3(1.)
#define BLACK vec3(0.)
#define ARTFUNKEL_PINK vec3(1., .2, .8)
#define MINT_COLOR vec3(.34118, .83922, .64706)

precision mediump float;

uniform vec2      u_resolution;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec3      u_itemRarity;
uniform int       u_itemRarityIndex;
uniform float     u_condition;
uniform float     u_level;
uniform float     u_foil;
uniform float     u_mint;
uniform float     u_aspectRatio;
uniform float     u_seasonal;
uniform float     u_valueScale;

// ── helpers ─────────────────────────────────────────────────────────────────

vec2 cardUv() {
  vec2 uv = gl_FragCoord.xy/u_resolution;
  uv.y = 1. - uv.y;
  return uv;
}

vec2 imageUv() {
  // Normalized coordinates of the div.
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Flip Y for texture coordinates.
  uv.y = 1.0 - uv.y;

  // Aspect ratio of the div.
  float screenAspect = u_resolution.x / u_resolution.y;

  // Aspect ratio of the source image:
  // width / height.
  float imageAspect = u_aspectRatio;

  if (screenAspect > imageAspect) {
    // Div is wider than the image.
    //
    // The image must be scaled to the div's width.
    // This means the image extends beyond the top/bottom,
    // so crop vertically.
    float scale = imageAspect / screenAspect;

    uv.y = (uv.y - 0.5) * scale + 0.5;

  } else {
    // Div is taller/narrower than the image.
    //
    // The image must be scaled to the div's height.
    // This means the image extends beyond the left/right,
    // so crop horizontally.
    float scale = screenAspect / imageAspect;

    uv.x = (uv.x - 0.5) * scale + 0.5;
  }

  return uv;
}


float hash(vec2 p)
{
    float val = sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453;
    return val - floor(val);
}

vec2 getRandomVector(float seed) {
    if (seed < 0.25) {
        return vec2(1.0, 1.0);
    } else if (seed < 0.5) {
        return vec2(-1.0, 1.0);
    } else if (seed < 0.75) {
        return vec2(1.0, -1.0);
    }

    return vec2(-1.0, -1.0);
}

float biLerp(
    float f0,
    float f1,
    float f2,
    float f3,
    float lerpX,
    float lerpY
) {
    float upper = mix(f1, f2, lerpX);
    float lower = mix(f0, f3, lerpX);
    return mix(lower, upper, lerpY);
}

float circleSmoothStepFill(vec2 center, float radius, vec2 p, float antiAlias) {
	return 1.0 - smoothstep(radius - antiAlias, radius + antiAlias, distance(center, p));
}

float circleSmoothStep(vec2 center, float radius, float thickness, vec2 p, float antiAlias) {
    float distFromCenter = distance(center, p);
    float halfThickness = thickness / 2.0;
    if (distFromCenter < radius) {
        return smoothstep(radius - halfThickness - antiAlias, radius - halfThickness + antiAlias, distFromCenter);
    } else {
        return 1.0 - smoothstep(radius + halfThickness - antiAlias, radius + halfThickness + antiAlias, distFromCenter);
    }
}

float getPointSmoothStep(vec2 p, vec2 uv, float radius, float antiAlias) {
    float pDist = distance(uv, p);
    return smoothstep(radius + antiAlias, radius - antiAlias, pDist);
}

mat2 createRotationMatrix(float rotation) {
    return mat2(
        cos(rotation), -sin(rotation),
        sin(rotation), cos(rotation)
    );
}

vec2 rotateAroundAxis(vec2 point, vec2 axis, float angle) 
{
    point -= axis;
    float x = point.x * cos(angle) - point.y * sin(angle);
    float y = point.y * cos(angle) + point.x * sin(angle);
    return vec2(x, y) + axis;
}

float lineSegmentSmoothStep(vec2 start, vec2 end, vec2 p, float lineThickness, float antiAlias, bool roundEnds) {
    float halfThickness = lineThickness / 2.0;
    if (dot(p-end, start - end) < 0.0 || dot(p - start, end - start) < 0.0) {
        return !roundEnds ? 0.0 : max(
			circleSmoothStepFill(start, halfThickness, p, antiAlias),
			circleSmoothStepFill(end, halfThickness, p, antiAlias)
        );  
    }
    
    vec2 lineVec = normalize(end - start);
    vec2 pVec = normalize(p - start);

    float angle = acos(dot(lineVec, pVec) / length(lineVec) * length(pVec));
    float distFromLine = sin(angle) * distance(start, p);
    
    return 1.0 - smoothstep(lineThickness / 2.0 - antiAlias, halfThickness + antiAlias, distFromLine);
}

struct AspectRatioData {
    mat2 scaleMatrix;
    mat2 inverseScaleMatrix;
    float aspectRatio;
};

AspectRatioData getAspectRatioData(vec2 uvSize) {
    float aspectRatio = uvSize.x / uvSize.y;
    AspectRatioData aspectRatioData;
    aspectRatioData.aspectRatio = aspectRatio;
    aspectRatioData.scaleMatrix = mat2(
        aspectRatio, 0.0,
        0.0, 1.0
    );
    
    aspectRatioData.inverseScaleMatrix = mat2(
        1.0 / aspectRatio, 0.0,
        0.0, 1.0
    );

    return aspectRatioData;
}

// --- RGB <-> HSV helpers ---
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(
        abs(q.z + (q.w - q.y) / (6.0 * d + e)),
        d / (q.x + e),
        q.x
    );
}

vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0 + vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
    rgb = rgb*rgb*(3.0-2.0*rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

// --- Main palette function ---
vec3 paletteColor(float seed, vec3 baseColor) {
    vec3 hsv = rgb2hsv(baseColor);

    float r1 = hash(vec2(seed));
    float r2 = hash(vec2(seed + 1.37));
    float r3 = hash(vec2(seed + 5.91));

    float hueOffset;

    if (r1 < 0.33) {
        // Analogous (~±30°)
        hueOffset = mix(-0.08, 0.08, r2);
    }
    else if (r1 < 0.66) {
        // Complementary (~180°)
        hueOffset = 0.5 + mix(-0.04, 0.04, r2);
    }
    else {
        // Triadic (~120°)
        hueOffset = (r2 < 0.5 ? 1.0/3.0 : -1.0/3.0) + mix(-0.04, 0.04, r3);
    }

    hsv.x = fract(hsv.x + hueOffset);

    // Slight palette variation
    hsv.y = clamp(hsv.y * mix(0.7, 1.2, r2), 0.0, 1.0);
    hsv.z = clamp(hsv.z * mix(0.8, 1.2, r3), 0.0, 1.0);

    float dimFactor = mix(.6, 1., hash(vec2(seed + 17.6)));
    return hsv2rgb(hsv) * dimFactor;
}

void getImagePalette(float seed, out vec3 colors[IMAGE_PALETTE_SIZE]) {
    colors[0] = texture2D(u_image, vec2(0.2, 0.2)).rgb;
    colors[1] = texture2D(u_image, vec2(0.8, 0.2)).rgb;
    colors[2] = texture2D(u_image, vec2(0.5, 0.5)).rgb;
    colors[3] = texture2D(u_image, vec2(0.2, 0.8)).rgb;
    colors[4] = texture2D(u_image, vec2(0.8, 0.8)).rgb;

    vec3 averageColor =
        (colors[0] + colors[1] + colors[2] + colors[3] + colors[4]) / 5.0;
    colors[5] = paletteColor(seed, averageColor);
    colors[6] = paletteColor(seed + 1.37, colors[2]);
    colors[7] = paletteColor(
        seed + 5.91,
        mix(colors[0], colors[4], 0.5)
    );
}

float getColorContrastRating(vec3 colorA, vec3 colorB) {
    vec3 a = clamp(colorA, 0.0, 1.0);
    vec3 b = clamp(colorB, 0.0, 1.0);
    vec3 linearA = mix(
        a / 12.92,
        pow((a + 0.055) / 1.055, vec3(2.4)),
        step(vec3(0.04045), a)
    );
    vec3 linearB = mix(
        b / 12.92,
        pow((b + 0.055) / 1.055, vec3(2.4)),
        step(vec3(0.04045), b)
    );
    float luminanceA = dot(linearA, vec3(0.2126, 0.7152, 0.0722));
    float luminanceB = dot(linearB, vec3(0.2126, 0.7152, 0.0722));
    float contrastRatio =
        (max(luminanceA, luminanceB) + 0.05) /
        (min(luminanceA, luminanceB) + 0.05);
    return clamp((contrastRatio - 1.0) / 20.0, 0.0, 1.0);
}

void getHighestContrastColors(
    vec3 colors[IMAGE_PALETTE_SIZE],
    out vec3 colorA,
    out vec3 colorB
) {
    float highestRating = -1.0;
    colorA = colors[0];
    colorB = colors[1];

    for (int i = 0; i < IMAGE_PALETTE_SIZE; i++) {
        for (int j = 0; j < IMAGE_PALETTE_SIZE; j++) {
            if (j > i) {
                float rating = getColorContrastRating(colors[i], colors[j]);
                if (rating > highestRating) {
                    highestRating = rating;
                    colorA = colors[i];
                    colorB = colors[j];
                }
            }
        }
    }
}

vec3 getRandomColor(float seed) {
    seed = hash(vec2(seed));
    float colorCount = 6.;
    float colorIncrement = 1. / colorCount;
    float seedFloor = floor(seed / colorIncrement) * colorIncrement;
    float lerpVal = smoothstep(seedFloor, seedFloor + colorIncrement, seed);

    if (seed <= colorIncrement * 1.) {
        return mix(RED, YELLOW, lerpVal);
    } else if (seed <= colorIncrement * 2.) {
        return mix(YELLOW, GREEN, lerpVal);
    } else if (seed <= colorIncrement * 3.) {
        return mix(GREEN, CYAN, lerpVal);
    } else if (seed <= colorIncrement * 4.) {
        return mix(CYAN, BLUE, lerpVal);
    } else if (seed <= colorIncrement * 5.) {
        return mix(BLUE, MAGENTA, lerpVal);
    } else {
        return mix(MAGENTA, vec3(1.), lerpVal);
    }
}

float getStripe(float stripeWidth, float offset, float val) {
    if (offset <= stripeWidth) {
        return 1.;
    }
    
    float stripeMod = mod(val, offset);
    if (stripeMod < stripeWidth) {
        return 1.;
    } else {
        float stripeAA = smoothstep(stripeWidth + AA, stripeWidth, stripeMod);
        float offsetAA = smoothstep(offset - AA, offset, stripeMod);
        return max(stripeAA, offsetAA);
    }
}

float getCautionStripe(float stripeWidth, float offset, vec2 uv) {
    float stripeX = getStripe(stripeWidth, offset, uv.x);
    float yVal = getStripe(stripeWidth, stripeWidth * 2., uv.y - uv.x);
    return stripeX * yVal;
}

float getHTVFactor(float holdTime, float transitionTime, float time) {
    float period = 2. * holdTime + 2. * transitionTime;
    float halfPeriod = period / 2.;
    float relativeTime = fract(time / halfPeriod);
    float halfHoldTime = holdTime / 2.;
    
    float val = smoothstep(halfHoldTime, halfHoldTime + transitionTime, relativeTime * halfPeriod);
    
    if (mod(floor(time / halfPeriod), 2.0) == 0.0) {
        val = 1. - val;
    }

    return val;
}

float getHTV(float lower, float upper, float holdTime, float transitionTime, float time) {
    return mix(lower, upper, getHTVFactor(holdTime, transitionTime, time));
}

vec3 getHTV(vec3 lower, vec3 upper, float holdTime, float transitionTime, float time) {
    return mix(lower, upper, getHTVFactor(holdTime, transitionTime, time));
}

float mcos(float val) {
    return (cos(val) + 1.) / 2.;
}

float msin(float val) {
    return (sin(val) + 1.) / 2.;
}

vec2 pingPongCount(float maxCount, float secondsPerNumber, float time) {
    float cycleLength = (maxCount - 1.0) * 2.0;

    float stepIndex = floor(time / secondsPerNumber);
    float t = mod(stepIndex, cycleLength);

    float value;
    float direction;

    if (t < maxCount) {
        value = t + 1.0;
        direction = 1.0;   // going up
    } else {
        value = cycleLength - t + 1.0;
        direction = -1.0;  // going down
    }

    return vec2(value, direction);
}

vec3 vecToNormalSpace(vec3 v) {
    return vec3(.5) + (normalize(v) * .5);
}

vec3 getLocalHexCenter(vec2 uv, float hexRadius) {
    float shortRadius = hexRadius * sin(SIXTY_DEGREES);
    vec2 hexCenter = vec2(uv.x - mod(uv.x, 2. * shortRadius) + shortRadius,
                            uv.y - mod(uv.y, 3. * hexRadius) + 1.5 * hexRadius);
         
    return vec3(hexCenter.x, hexCenter.y, distance(hexCenter, uv));
}

vec2 getHexCenter(vec2 uv, float hexRadius)
{
    float shortRadius = hexRadius * sin(SIXTY_DEGREES);
    vec3 hexCenter1 = getLocalHexCenter(uv, hexRadius);
         
    vec2 altOffset = vec2(shortRadius, 1.5 * hexRadius);
                            
    vec3 hexCenter2 = getLocalHexCenter(uv + altOffset, hexRadius);
                            
    if (hexCenter1.z < hexCenter2.z) {
        return hexCenter1.xy;
    } else {
        return hexCenter2.xy - altOffset;
    }
}

struct HexData {
    // value (0 -> 1) representing the uv's value in radial space, origin is (1, 0)
    float radialVal; 
    
    // value (0 -> 1) representing approximity to center compared to hex radius
    float distFromCenter;  
    
    // center vertex of the hexagon
    vec2 center;           
    
    // locations of each vertex of the hex
    vec2 vertices[6];
    
    // locations of hex midpoints
    vec2 midpoints[6];
    
    // value (0 -> 1) representing approximity to center compared to hexagon's edge
    float edgeCoefficient;  
    
    // value (0 -> 1) representinglinear interpolation of radians between local triangle vertices
    float radialLerp;      
};

void getHexMidpoints(
    vec2 hexCenter,
    float hexRadius,
    out vec2 hexMidpoints[6]
) {
    float rotationIncrement = TWOPI / 6.;
    vec2 firstVertex = hexCenter + vec2(hexRadius * sin(SIXTY_DEGREES), 0.);
    
    for (int i=0; i<6; ++i) {
        hexMidpoints[i] = rotateAroundAxis(firstVertex, hexCenter, rotationIncrement * float(i));
    }
}

void getHexVertices(
    vec2 hexCenter,
    float hexRadius,
    out vec2 hexVertices[6]
) {
    float rotationIncrement = TWOPI / 6.;
    vec2 firstVertex = rotateAroundAxis(hexCenter + vec2(hexRadius, 0.), hexCenter, TWOPI / 12.);
    
    for (int i=0; i<6; ++i) {
        hexVertices[i] = rotateAroundAxis(firstVertex, hexCenter, rotationIncrement * float(i));
    }
}

float getOffsetAngle(vec2 first, vec2 second) {
    vec2 offsetVec = second - first;
    float angle = atan(offsetVec.y / offsetVec.x);
    
    
    if (first.x < second.x) {
        angle = TWOPI / 2.0 + angle;
    } else if (first.y > second.y) {
        angle = TWOPI + angle;
    }
    
    return angle;
}

float getRadialVal(vec2 hexCenter, vec2 p) {
    float offsetAngle = getOffsetAngle(hexCenter, p);
    offsetAngle = mod(TWOPI - offsetAngle + 3.0 * TWOPI / 6.0, TWOPI);
    return offsetAngle / TWOPI;
}

void getHexData(
    vec2 uv, 
    float hexRadius,
    out HexData hexData)
{
    vec2 hexCenter = getHexCenter(uv, hexRadius);
    
    hexData.radialVal = getRadialVal(hexCenter, uv);
    hexData.center = hexCenter;
    hexData.distFromCenter = distance(uv, hexCenter) / hexRadius;
    getHexVertices(hexCenter, hexRadius, hexData.vertices);
    getHexMidpoints(hexCenter, hexRadius, hexData.midpoints);
    hexData.radialLerp = mod(hexData.radialVal, 1./6.) / (1./6.);
}

float getLineValFromVertices(vec2 uv, vec2 vertices[6], float lineThickness) {
    float lineVal = 0.;
    for (int i=0; i<6; i++) {
        vec2 first = vertices[i];

        vec2 second;
        if (i == 0) {
            second = vertices[5];
        } else {
            second = vertices[i-1];
        }
        lineVal = max(lineVal, lineSegmentSmoothStep(first, second, uv, lineThickness, AA, true));
    }
    
    return lineVal;
}

float getPointVal(vec2 uv, vec2 point, float radius, float antialias) {
    float dist = distance(uv, point);
    return smoothstep(radius + antialias, radius - antialias, dist);
}