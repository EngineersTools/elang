import './e-lang-terminals'
import './e-lang-types'

Expression:
    Assignment
;

Assignment infers Expression:
    Addition ({infer BinaryExpression.left=current} operator=('=') right=Addition)*
;

Addition infers Expression:
    Multiplication ({infer BinaryExpression.left=current} operator=('+' | '-') right=Multiplication)*
;

Multiplication infers Expression:
    Exponentiation ({infer BinaryExpression.left=current} operator=('*' | '/') right=Exponentiation)*
;

Exponentiation infers Expression:
    Logical ({infer BinaryExpression.left=current} operator='^' right=Logical)*
;

Logical infers Expression:
    Comparison ({infer BinaryExpression.left=current} operator=('and' | 'or') right=Comparison)*
;

Comparison infers Expression:
    UnitConversionExpression ({infer BinaryExpression.left=current} operator=('<' | '<=' | '>' | '>=' | '==' | '!=') right=UnitConversionExpression)*
;

UnitConversionExpression infers Expression:
    ModelMemberCall
    (
        {infer UnitConversionExpression.left=current}
        operator=('->')
        unit=[UnitDeclaration:ID]
        (arguments+=Expression (',' arguments+=Expression)*)?
    )*
;


ModelMemberCall infers Expression:
    PrimaryExpression
    ({infer ModelMemberCall.previous=current} 
        ("." element=[NamedElement:ID] (
            explicitOperationCall?='(' 
                (
                    arguments+=Expression (',' arguments+=Expression)*
                )?
            ')' |
            accessElement?='[' 
                (
                    index=(NUM | Expression)
                ) 
            ']'
            )?
        ) | (
            explicitOperationCall?='('
                (
                    arguments+=Expression (',' arguments+=Expression)*
                )?
            ')'
        ) | (
            accessElement?='[' 
                (
                    index=(NUM | Expression)
                ) 
            ']'
        )
    )*
;

PrimaryExpression infers Expression:
    '(' Expression ')' |
    StringLiteral |
    NumberLiteral |
    BooleanLiteral |
    NullLiteral |
    MeasurementLiteral |
    ModelValue |
    ModelMemberAssignment |
    UnaryExpression |
    ListValue |
    ListCount |
    ListAdd |
    ListRemove |
    MathematicalFunction |
    ListAccess |
    FeatureCall
;

FeatureCall infers Expression:
	{infer ModelMemberCall}
    element=[NamedElement:ID]
    // Optional function call after referencing an element
    (explicitOperationCall?='('
        (
            arguments+=Expression (',' arguments+=Expression)*
        )?
    ')')?
;

ListAccess infers Expression:
    {infer ModelMemberCall}
	element=[NamedElement:ID]
    (accessElement?='[' 
        (
            index=(NUM | Expression)
        ) 
    ']')
;

UnaryExpression:
    operator=('!' | '-') value=Expression
;

// Most granular, low-level expressions
StringLiteral:
    value=STRING
;

NumberLiteral:
    value=NUM
;

BooleanLiteral:
    value?='true' | 'false'
;

NullLiteral:
    value='null'
;

MeasurementLiteral:
    value=NUM '_[' unit=[UnitDeclaration:ID] ']'
;

ModelValue:
    '{'
        (members+=ModelMemberAssignment (',' members+=ModelMemberAssignment)*)?
    '}'
;

ModelMemberAssignment:
    property=ID ':' value=(Expression | LambdaDeclaration)
;

ListValue:
    '['
        (items+=Expression (',' items+=Expression)*)?
    ']'
;

ListCount:
    'listCount' '(' list=Expression')'
;

ListAdd:
    'listAdd' '(' list=Expression ',' item=Expression ')'
;

ListRemove:
    'listRemove' '(' list=Expression (',' index=(NUM | Expression))? ')'
;

// Mathematical Functions
// 'abs' | 'acos' | 'asin' | 'atan' | 'atan2' | 'ceil' | 'cos' | 'cosh' | 'exp' | 'floor' | 'log' | 'log10' | 'max' | 'min' | 'pow' | 'round' | 'sin' | 'sinh' | 'sqrt' | 'tan' | 'tanh'

MathematicalFunction:
    Absolute |
    Cosine |
    Sine |
    Tangent |
    ArcCosine |
    ArcSine |
    ArcTangent |
    Round |
    Ceiling |
    Floor |
    Root |
    SuqareRoot |
    LogarithmBaseTen |
    NaturalLogarithm |
    Minimum |
    Maximum
;

Absolute:
    'abs' '(' value=Expression')'
;

Cosine:
    'cos' '(' value=Expression')'
;

Sine:
    'sin' '(' value=Expression')'
;

Tangent:
    'tan' '(' value=Expression')'
;

ArcCosine:
    'acos' '(' value=Expression')'
;

ArcSine:
    'asin' '(' value=Expression')'
;

ArcTangent:
    'atan' '(' value=Expression')'
;

Round:
    'round' '(' value=Expression')'
;

Ceiling:
    'ceil' '(' value=Expression')'
;

Floor:
    'floor' '(' value=Expression')'
;

Root:
    'root' '(' root=Expression ',' value=Expression ')'
;

SuqareRoot:
    'sqrt' '(' value=Expression')'
;

LogarithmBaseTen:
    'log10' '(' value=Expression')'
;

NaturalLogarithm:
    'ln' '(' value=Expression')'
;

Minimum:
    'min' '(' value=Expression ')'
;

Maximum:
    'max' '(' value=Expression ')'
;
